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
  gasUsedLatest: number;
  gasLimitLatest: number;
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
  pools: Pool[];
  recentBlocks: RecentBlock[];
  txSeries: number[];       // tx count per block over the window (oldest -> newest)
  recentTxs: RecentTx[];
};

export type PartnerAsset = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  totalSupply: number;
};

export type Pool = {
  pair: string;
  sym0: string; sym1: string;
  reserve0: number; reserve1: number;
  usd: number;      // value of the on-chain-priceable legs (stables + WRBNT)
};

export type RecentBlock = { number: number; txCount: number; timestamp: number; gasUsed: number };
export type RecentTx = { hash: string; from: string; to: string | null; valueRbnt: number; block: number };

const lc = (a: string) => a.toLowerCase();

// Phase 1: the fast metrics (block, gas, chain, TVL, partners). No window scan,
// so the key cards paint in about a second. Window metrics come from fetchWindow.
export async function fetchFast(): Promise<Snapshot> {
  const [chainId, blockNumber, gasPriceWei, syncing, latest, tvl, partners] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
    (client.request as any)({ method: "eth_syncing", params: [] }) as Promise<unknown>,
    client.getBlock({ blockTag: "latest", includeTransactions: false }).catch(() => null),
    fetchTvl(),
    fetchPartners(),
  ]);
  return {
    fetchedAt: Date.now(),
    chainId,
    blockNumber: Number(blockNumber),
    syncing: Boolean(syncing) && syncing !== false,
    gasPriceWei,
    gasUsedLatest: latest ? Number(latest.gasUsed) : 0,
    gasLimitLatest: latest ? Number(latest.gasLimit) : 0,
    blockTimeSec: null,
    windowBlocks: 0,
    windowSeconds: null,
    txInWindow: 0,
    tps: null,
    txPerDayEst: null,
    activeAddresses: 0,
    ...tvl,
    partners,
    recentBlocks: [],
    txSeries: [],
    recentTxs: [],
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
  const txSeries: number[] = [];
  const recentTxsAll: RecentTx[] = [];
  let gasUsedLatest = 0, gasLimitLatest = 0;
  for (const blk of valid) {
    const txs = blk.transactions as any[];
    txInWindow += txs.length;
    txSeries.push(txs.length);
    for (const tx of txs) {
      if (tx.from) active.add(lc(tx.from));
      if (tx.to) active.add(lc(tx.to));
      recentTxsAll.push({
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? null,
        valueRbnt: Number(formatUnits(BigInt(tx.value ?? 0n), 18)),
        block: Number(blk.number),
      });
    }
  }
  if (valid.length) {
    const last = valid[valid.length - 1];
    gasUsedLatest = Number(last.gasUsed);
    gasLimitLatest = Number(last.gasLimit);
  }
  const recentBlocks: RecentBlock[] = valid
    .slice(-14)
    .map((b) => ({ number: Number(b.number), txCount: (b.transactions as any[]).length, timestamp: Number(b.timestamp), gasUsed: Number(b.gasUsed) }))
    .reverse();
  const recentTxs = recentTxsAll.slice(-15).reverse();

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
    gasUsedLatest,
    gasLimitLatest,
    blockTimeSec,
    windowBlocks: valid.length,
    windowSeconds,
    txInWindow,
    tps,
    txPerDayEst,
    activeAddresses: active.size,
    ...tvl,
    partners,
    recentBlocks,
    txSeries,
    recentTxs,
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
      return { pair: p, t0: lc(t0 as string), t1: lc(t1 as string), r: reserves as [bigint, bigint, number] };
    })
  );

  // Resolve symbol + decimals for every distinct pool token (batched).
  const tokenSet = new Set<string>();
  for (const { t0, t1 } of pairData) { tokenSet.add(t0); tokenSet.add(t1); }
  const tokenList = [...tokenSet];
  const meta = await Promise.all(
    tokenList.map(async (addr) => {
      const a = addr as `0x${string}`;
      const [sym, dec] = await Promise.all([
        client.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
        client.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
      ]);
      return { addr, sym: sym as string, dec: Number(dec) };
    })
  );
  const SYM: Record<string, string> = {}, DEC: Record<string, number> = {};
  for (const m of meta) { SYM[m.addr] = m.sym; DEC[m.addr] = m.dec; }
  const dOf = (a: string) => DECIMALS[a] ?? DEC[a] ?? 18;

  // Derive the on-chain RBNT price from WRBNT/stablecoin pools (USD-weighted).
  const wr = lc(ADDR.WRBNT);
  let usdNum = 0, wrbntDen = 0;
  for (const { t0, t1, r } of pairData) {
    const isStable0 = STABLES.has(t0), isStable1 = STABLES.has(t1);
    if (t0 === wr && isStable1) {
      const w = Number(formatUnits(r[0], dOf(wr)));
      const s = Number(formatUnits(r[1], dOf(t1)));
      if (w > 0) { usdNum += s; wrbntDen += w; }
    } else if (t1 === wr && isStable0) {
      const w = Number(formatUnits(r[1], dOf(wr)));
      const s = Number(formatUnits(r[0], dOf(t0)));
      if (w > 0) { usdNum += s; wrbntDen += w; }
    }
  }
  const rbntUsd = wrbntDen > 0 ? usdNum / wrbntDen : null;
  const legUsd = (addr: string, amt: number) =>
    STABLES.has(addr) ? amt : addr === wr && rbntUsd ? amt * rbntUsd : 0;

  // TVL + per-pool breakdown.
  let tvlStableUsd = 0, wrbntLocked = 0;
  const pools: Pool[] = [];
  for (const { pair, t0, t1, r } of pairData) {
    const a0 = Number(formatUnits(r[0], dOf(t0)));
    const a1 = Number(formatUnits(r[1], dOf(t1)));
    if (STABLES.has(t0)) tvlStableUsd += a0;
    if (STABLES.has(t1)) tvlStableUsd += a1;
    if (t0 === wr) wrbntLocked += a0;
    if (t1 === wr) wrbntLocked += a1;
    pools.push({
      pair, sym0: SYM[t0] || "?", sym1: SYM[t1] || "?",
      reserve0: a0, reserve1: a1, usd: legUsd(t0, a0) + legUsd(t1, a1),
    });
  }
  pools.sort((a, b) => b.usd - a.usd);
  const tvlUsd = tvlStableUsd + (rbntUsd ? wrbntLocked * rbntUsd : 0);

  return { rbntUsd, tvlStableUsd, tvlUsd, wrbntLocked, pairCount, pools };
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
