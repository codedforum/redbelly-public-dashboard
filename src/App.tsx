import React from "react";
import { useDashboard } from "./lib/useDashboard";
import { StatCard } from "./components/StatCard";
import { fmtInt, fmtUsd, fmtCompact, fmtPrice, ago, transferFeeUsd } from "./lib/format";
import { WINDOW_BLOCKS } from "./lib/metrics";

const EXPLORER = "https://redbelly.routescan.io";

export default function App() {
  const { data, loading, stale, error, lastSuccess, refresh, refreshMs } = useDashboard();
  const [, force] = React.useReducer((x) => x + 1, 0);
  // re-render every second so the "updated Xs ago" stamp ticks
  React.useEffect(() => { const t = setInterval(force, 1000); return () => clearInterval(t); }, []);

  const d = data;
  const feeUsd = d ? transferFeeUsd(d.gasPriceWei as any, d.rbntUsd) : null;
  const windowMin = d?.windowSeconds ? Math.round(d.windowSeconds / 60) : null;
  const win = Boolean(d && d.windowBlocks > 0); // phase-2 windowed metrics ready

  return (
    <div className="page">
      <header className="head">
        <div className="brand">
          <span className="dot" />
          <div>
            <h1>Redbelly Network</h1>
            <p>Live public dashboard · metrics sourced directly from RPC</p>
          </div>
        </div>
        <div className="head-right">
          <span className={"net " + (d && !d.syncing ? "ok" : "warn")}>
            <span className="led" /> {d ? `Chain ${d.chainId} · ${d.syncing ? "syncing" : "synced"}` : "connecting"}
          </span>
          <button className="refresh" onClick={refresh} title="Refresh now">↻</button>
        </div>
      </header>

      {stale && (
        <div className="banner stale" role="status">
          ⚠ Showing last known values. The RPC did not respond on the latest refresh
          {error ? ` (${error})` : ""}. Data as of {lastSuccess ? ago(lastSuccess) : "earlier"}.
        </div>
      )}

      {loading && !d && <div className="banner">Loading live metrics from the Redbelly RPC…</div>}

      {d && (
        <>
          <section className="grid">
            <StatCard label="TVL (priced, on-chain)" accent
              value={fmtUsd(d.tvlUsd)}
              sub={`Stablecoin floor ${fmtUsd(d.tvlStableUsd)} · ${d.pairCount} DEX pairs`} />
            <StatCard label={win ? `Transactions (last ~${windowMin} min)` : "Transactions (recent)"}
              value={win ? fmtInt(d.txInWindow) : "…"}
              sub={win && d.txPerDayEst != null ? `≈ ${fmtInt(d.txPerDayEst)} / 24h at current rate` : "scanning recent blocks"} />
            <StatCard label="Live throughput"
              value={win && d.tps != null ? `${d.tps.toFixed(3)} TPS` : "…"}
              sub={win && d.blockTimeSec ? `~${d.blockTimeSec.toFixed(1)}s block time` : "scanning recent blocks"} />
            <StatCard label={win ? `Active addresses (last ~${windowMin} min)` : "Active addresses (recent)"}
              value={win ? fmtInt(d.activeAddresses) : "…"}
              sub={win ? `unique senders and recipients over ${d.windowBlocks} blocks` : "scanning recent blocks"} />
            <StatCard label="Latest block"
              value={fmtInt(d.blockNumber)}
              sub={<a href={`${EXPLORER}/block/${d.blockNumber}`} target="_blank" rel="noopener">view on explorer ↗</a>} />
            <StatCard label="Transfer fee (USD)"
              value={feeUsd != null ? fmtUsd(feeUsd) : "—"}
              sub="21,000 gas · USD-denominated fees" />
            <StatCard label="RBNT price (on-chain)"
              value={fmtPrice(d.rbntUsd)}
              sub="from WRBNT / stablecoin pools" />
            <StatCard label="WRBNT in DEX pools"
              value={fmtCompact(d.wrbntLocked) + " RBNT"}
              sub="liquidity locked across reddex" />
          </section>

          <section className="block">
            <h2>Verified entities</h2>
            <div className="note">
              Redbelly is a permissioned network: every participant is identity-verified at the
              protocol level via Receptor (KYC/KYB). This credential check is enforced in consensus,
              not through a public EVM registry, so a live count is not exposed on-chain. We do not
              fabricate one. See the technical docs for how identity gating works.
            </div>
          </section>

          <section className="block">
            <h2>Partner assets, live on-chain</h2>
            <p className="muted">Real tokenized-asset and stablecoin deployments on Redbelly mainnet, read live (name, symbol, supply).</p>
            <div className="partners">
              {d.partners.map((p) => (
                <a className="partner" key={p.address} href={`${EXPLORER}/token/${p.address}`} target="_blank" rel="noopener">
                  <div className="p-sym">{p.symbol}</div>
                  <div className="p-name">{p.name}</div>
                  <div className="p-supply">{fmtCompact(p.totalSupply)} supply</div>
                  <div className="p-addr">{p.address.slice(0, 6)}…{p.address.slice(-4)} ↗</div>
                </a>
              ))}
            </div>
            <p className="muted small">
              Ecosystem partners include Novatti (AUDD), Hutly, Liquidise / Tokeniser, Project Acacia
              (RBA / ASIC pilot), LayerZero, and Celer. Partnership status is off-chain; the asset
              tiles above are verified live from the chain.
            </p>
          </section>

          <footer className="foot">
            <div>
              Updated {lastSuccess ? ago(lastSuccess) : "—"} · auto-refresh every {refreshMs / 1000}s ·
              source: <code>governors.mainnet.redbelly.network</code> (RPC, direct)
            </div>
            <div className="muted small">
              Metrics computed client-side from raw RPC. Windowed metrics cover the last ~{WINDOW_BLOCKS} blocks.
              <img src="./mascot.png" alt="" style={{height:16,verticalAlign:"-3px",margin:"0 4px"}}/> Built by Smartcoded.
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
