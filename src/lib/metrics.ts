import { formatUnits, getAddress } from "viem";
import { client, ADDR, STABLES, DECIMALS } from "./chain";
import { factoryAbi, pairAbi, erc20Abi } from "./abi";

// How many recent blocks to scan for throughput and active addresses.
// Block time is ~40s, so 60 blocks is roughly the last 40 minutes. Labeled in the UI
// from the actual timestamp span, never hard-coded.
export const WINDOW_BLOCKS = 60;

export type Snapshot = {
  fetchedAt: number;
  chainId: number;
  blockNumber: number;
  syncing: boolean;
  gasPriceWei: bigint;
  blockTimeSec: number | null;
  windowBlocks: number;
  windowSeconds: number | null;
  txInWindow: number;
  tps: number | null;
  txPerDayEst: number | null;
  activeAddresses: number;
  rbntUsd: number | null;
  tvlStableUsd: number;     // assumption-free floor (stablecoin reserves only)
  tvlUsd: number;           // stables + WRBNT priced from pools
  wrbntLocked: number;
  pairCount: number;
  partners: PartnerAsset[];
};

export type PartnerAsset = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  totalSupply: number;
};

const lc = (a: string) => a.toLowerCase();

// Phase 1: the fast metrics (block, gas, chain, TVL, partners). No window scan,
// so the key cards paint in about a second. Window metrics come from fetchWindow.
export async function fetchFast(): Promise<Snapshot> {
  const [chainId, blockNumber, gasPriceWei, syncing, tvl, partners] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
    (client.request as any)({ method: "eth_syncing", params: [] }) as Promise<unknown>,
    fetchTvl(),
    fetchPartners(),
  ]);
  return {
    fetchedAt: Date.now(),
    chainId,
    blockNumber: Number(blockNumber),
    syncing: Boolean(syncing) && syncing !== false,
    gasPriceWei,
    blockTimeSec: null,
    windowBlocks: 0,
    windowSeconds: null,
    txInWindow: 0,
    tps: null,
    txPerDayEst: null,
    activeAddresses: 0,
    ...tvl,
    partners,
  };
}

// Phase 2: full snapshot including the windowed scan (tx count, TPS, active addresses).
export async function fetchSnapshot(): Promise<Snapshot> {
  const [chainId, blockNumber, gasPriceWei, syncing] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
    (client.request as any)({ method: "eth_syncing", params: [] }) as Promise<unknown>,
  ]);

  // Scan the recent window (batched). Full transactions for active-address counting.
  const from = blockNumber - BigInt(WINDOW_BLOCKS) + 1n;
  const blockNums: bigint[] = [];
  for (let b = from; b <= blockNumber; b++) blockNums.push(b);

  const blocks = await Promise.all(
    blockNums.map((bn) =>
      client.getBlock({ blockNumber: bn, includeTransactions: true }).catch(() => null)
    )
  );
  const valid = blocks.filter(Boolean) as NonNullable<(typeof blocks)[number]>[];

  let txInWindow = 0;
  const active = new Set<string>();
  for (const blk of valid) {
    const txs = blk.transactions as any[];
    txInWindow += txs.length;
    for (const tx of txs) {
      if (tx.from) active.add(lc(tx.from));
      if (tx.to) active.add(lc(tx.to));
    }
  }

  let windowSeconds: number | null = null;
  let blockTimeSec: number | null = null;
  if (valid.length >= 2) {
    const first = Number(valid[0].timestamp);
    const last = Number(valid[valid.length - 1].timestamp);
    windowSeconds = last - first;
    blockTimeSec = windowSeconds > 0 ? windowSeconds / (valid.length - 1) : null;
  }
  const tps = windowSeconds && windowSeconds > 0 ? txInWindow / windowSeconds : null;
  const txPerDayEst = tps != null ? Math.round(tps * 86400) : null;

  // ---- TVL from reddex pairs (on-chain, no third-party price) ----
  const tvl = await fetchTvl();

  // ---- partner asset proofs ----
  const partners = await fetchPartners();

  return {
    fetchedAt: Date.now(),
    chainId,
    blockNumber: Number(blockNumber),
    syncing: Boolean(syncing) && syncing !== false,
    gasPriceWei,
    blockTimeSec,
    windowBlocks: valid.length,
    windowSeconds,
    txInWindow,
    tps,
    txPerDayEst,
    activeAddresses: active.size,
    ...tvl,
    partners,
  };
}

async function fetchTvl() {
  const len = (await client.readContract({
    address: ADDR.reddexFactory as `0x${string}`,
    abi: factoryAbi,
    functionName: "allPairsLength",
  })) as bigint;
  const pairCount = Number(len);

  const pairAddrs = (await Promise.all(
    Array.from({ length: pairCount }, (_, i) =>
      client.readContract({
        address: ADDR.reddexFactory as `0x${string}`,
        abi: factoryAbi,
        functionName: "allPairs",
        args: [BigInt(i)],
      })
    )
  )) as `0x${string}`[];

  const pairData = await Promise.all(
    pairAddrs.map(async (p) => {
      const [t0, t1, reserves] = await Promise.all([
        client.readContract({ address: p, abi: pairAbi, functionName: "token0" }),
        client.readContract({ address: p, abi: pairAbi, functionName: "token1" }),
        client.readContract({ address: p, abi: pairAbi, functionName: "getReserves" }),
      ]);
      return { t0: lc(t0 as string), t1: lc(t1 as string), r: reserves as [bigint, bigint, number] };
    })
  );

  // Derive the on-chain RBNT price from WRBNT/stablecoin pools (USD-weighted).
  const wr = lc(ADDR.WRBNT);
  let usdNum = 0, wrbntDen = 0;
  for (const { t0, t1, r } of pairData) {
    const isStable0 = STABLES.has(t0), isStable1 = STABLES.has(t1);
    if (t0 === wr && isStable1) {
      const w = Number(formatUnits(r[0], DECIMALS[wr]));
      const s = Number(formatUnits(r[1], DECIMALS[t1]));
      if (w > 0) { usdNum += s; wrbntDen += w; }
    } else if (t1 === wr && isStable0) {
      const w = Number(formatUnits(r[1], DECIMALS[wr]));
      const s = Number(formatUnits(r[0], DECIMALS[t0]));
      if (w > 0) { usdNum += s; wrbntDen += w; }
    }
  }
  const rbntUsd = wrbntDen > 0 ? usdNum / wrbntDen : null;

  // TVL: stablecoin reserves (assumption-free) + WRBNT reserves priced at rbntUsd.
  let tvlStableUsd = 0, wrbntLocked = 0;
  for (const { t0, t1, r } of pairData) {
    if (STABLES.has(t0)) tvlStableUsd += Number(formatUnits(r[0], DECIMALS[t0]));
    if (STABLES.has(t1)) tvlStableUsd += Number(formatUnits(r[1], DECIMALS[t1]));
    if (t0 === wr) wrbntLocked += Number(formatUnits(r[0], DECIMALS[wr]));
    if (t1 === wr) wrbntLocked += Number(formatUnits(r[1], DECIMALS[wr]));
  }
  const tvlUsd = tvlStableUsd + (rbntUsd ? wrbntLocked * rbntUsd : 0);

  return { rbntUsd, tvlStableUsd, tvlUsd, wrbntLocked, pairCount };
}

async function fetchPartners(): Promise<PartnerAsset[]> {
  const tokens = [
    { address: ADDR.AUDD, label: "AUDD (Novatti) · AUD stablecoin" },
    { address: ADDR.sHUT, label: "Hutly Shadow · tokenized rent rolls" },
  ];
  return Promise.all(
    tokens.map(async (t) => {
      const a = t.address as `0x${string}`;
      const [name, symbol, decimals, supply] = await Promise.all([
        client.readContract({ address: a, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: a, abi: erc20Abi, functionName: "totalSupply" }),
      ]);
      const d = Number(decimals);
      return {
        name: name as string,
        symbol: symbol as string,
        address: getAddress(t.address),
        decimals: d,
        totalSupply: Number(formatUnits(supply as bigint, d)),
      };
    })
  );
}
