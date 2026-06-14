# Architecture and Maintenance

## Overview
A single-page React app (Vite, TypeScript) that reads Redbelly mainnet metrics **directly from the RPC in the browser** and renders them. There is no backend and no database: the Redbelly RPC returns `access-control-allow-origin: *`, so the browser fetches it directly. This keeps the app fast, cheap to host, and trivially portable.

```
Browser (React) ──viem(batched JSON-RPC)──> https://governors.mainnet.redbelly.network
```

## Data flow
1. `src/lib/chain.ts` defines chain 151 and a viem public client with a **batching** HTTP transport (concurrent calls collapse into one POST) plus timeout and retry.
2. `src/lib/metrics.ts` computes the snapshot in two phases:
   - `fetchFast()` returns the cheap metrics (block, gas, chain, TVL, partner tokens) so the key cards paint in under three seconds.
   - `fetchSnapshot()` additionally scans the last `WINDOW_BLOCKS` (60) full blocks for transaction count, TPS, and unique active addresses.
3. `src/lib/useDashboard.ts` runs phase 1 then phase 2 on first load, refreshes every 60 seconds, caches the last successful snapshot in `localStorage`, and exposes a `stale` flag.
4. `src/App.tsx` renders the cards, the stale banner, and the partner tiles.

## How each metric is derived
- **TVL:** read `allPairsLength` and each pair's `token0/token1/getReserves` from the reddex factory (`0x262E…C142`). Stablecoin legs (USDT, USDC.e) are valued at $1. WRBNT is priced from the WRBNT/stablecoin pool ratio (USD-weighted), so no external price feed is used. The UI shows both the assumption-free stablecoin floor and the priced TVL.
- **Throughput / transactions / active addresses:** scan the last 60 blocks with `eth_getBlockByNumber(includeTransactions:true)`; sum tx counts, divide by the timestamp span for TPS, and collect unique `from`/`to`. The window length shown in the UI is computed from the actual timestamps, never hard-coded.
- **Gas / fee:** `eth_gasPrice` × 21,000 × the on-chain RBNT price gives the USD cost of a transfer (Redbelly fees are USD-denominated, about $0.01).
- **Partner assets:** live `name`/`symbol`/`decimals`/`totalSupply` reads of AUDD and Hutly sHUT as on-chain proof of partner deployments.

## Deliberately not faked
- **Verified entities:** Redbelly's identity (Receptor) is enforced at the protocol layer, not via a public EVM registry, so there is no `eth_call`-readable count. It is shown qualitatively rather than with an invented number.
- **Lifetime totals:** RPC has no cumulative transaction or all-time active-address counter, so only windowed values are shown, clearly labelled.

## Resilience
- Every refresh that fails leaves the previous snapshot on screen and flips the **stale banner** on, with the age of the last good data.
- The last successful snapshot is persisted to `localStorage`, so a reload during an RPC outage still shows the last known values immediately.
- Per-block fetches are individually `catch`ed, so a single bad block does not blank the window metrics.

## Maintenance
- **Change the RPC:** set `VITE_REDBELLY_RPC` (see `.env.example`) or edit `src/lib/chain.ts`.
- **Point at testnet:** change the chain id to 153 and the RPC to the testnet endpoint in `chain.ts`. (Note: the working testnet RPC is `governors.testnet.redbelly.network`; the older `rpc-testnet.redbelly.network` does not resolve.)
- **Add a token or DEX:** add the address to `ADDR`/`DECIMALS` in `chain.ts` and extend `fetchTvl()`/`fetchPartners()` in `metrics.ts`.
- **Tune the window or refresh:** `WINDOW_BLOCKS` in `metrics.ts`, `REFRESH_MS` in `useDashboard.ts` (kept at the 60s minimum).
- **Refresh the on-chain addresses** if the reddex factory or partner tokens are redeployed.

## Performance
The production bundle is about 128 KB gzipped. Key metrics paint in under three seconds; the windowed scan fills in shortly after. No server round-trips beyond the RPC.
