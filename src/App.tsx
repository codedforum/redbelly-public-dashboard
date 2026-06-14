import React, { useState } from "react";
import { useDashboard } from "./lib/useDashboard";
import { StatCard } from "./components/StatCard";
import { Sparkline } from "./components/Sparkline";
import { Modal } from "./components/Modal";
import { fmtInt, fmtUsd, fmtCompact, fmtPrice, ago, transferFeeUsd } from "./lib/format";
import { WINDOW_BLOCKS, type Pool, type PartnerAsset } from "./lib/metrics";

const EXPLORER = "https://redbelly.routescan.io";
const short = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "·");

export default function App() {
  const { data, loading, stale, error, lastSuccess, refresh, refreshMs } = useDashboard();
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { const t = setInterval(force, 1000); return () => clearInterval(t); }, []);
  const [modal, setModal] = useState<null | "pools" | "blocks" | { partner: PartnerAsset }>(null);

  const d = data;
  const feeUsd = d ? transferFeeUsd(d.gasPriceWei as any, d.rbntUsd) : null;
  const windowMin = d?.windowSeconds ? Math.round(d.windowSeconds / 60) : null;
  const win = Boolean(d && d.windowBlocks > 0);
  const util = d && d.gasLimitLatest ? (d.gasUsedLatest / d.gasLimitLatest) * 100 : null;

  return (
    <div className="page">
      <div className="bg-blobs"><span className="b1" /><span className="b2" /><span className="b3" /></div>

      <header className="head">
        <div className="brand">
          <img className="brand-mascot" src="./mascot.png" alt="" />
          <div>
            <h1>Redbelly Network</h1>
            <p>Live public dashboard · direct from RPC</p>
          </div>
        </div>
        <div className="head-right">
          <span className={"net " + (d && !d.syncing ? "ok" : "warn")}>
            <span className="led" /> {d ? `Chain ${d.chainId} · ${d.syncing ? "syncing" : "synced"}` : "connecting"}
          </span>
          <span className="updated">{lastSuccess ? `updated ${ago(lastSuccess)}` : "loading"}</span>
          <button className="refresh" onClick={refresh} title="Refresh now">↻</button>
        </div>
      </header>

      {stale && (
        <div className="banner stale" role="status">
          ⚠ Showing last known values. The RPC did not respond on the latest refresh{error ? ` (${error})` : ""}.
          Data as of {lastSuccess ? ago(lastSuccess) : "earlier"}.
        </div>
      )}
      {loading && !d && <div className="banner">Loading live metrics from the Redbelly RPC…</div>}

      {d && (
        <>
          {/* hero row */}
          <section className="hero-grid">
            <div className="hcard accent" onClick={() => setModal("pools")} role="button">
              <div className="hcard-top"><span>Total Value Locked</span><span className="tag">on-chain · {d.pairCount} pools</span></div>
              <div className="hcard-val">{fmtUsd(d.tvlUsd)}</div>
              <div className="hcard-sub">Stablecoin floor {fmtUsd(d.tvlStableUsd)} · click for pool breakdown</div>
            </div>
            <div className="hcard">
              <div className="hcard-top"><span>Live throughput</span><span className="tag">{win ? `~${d.blockTimeSec?.toFixed(1)}s blocks` : "scanning"}</span></div>
              <div className="hcard-val">{win && d.tps != null ? `${d.tps.toFixed(3)}` : "…"}<span className="unit"> TPS</span></div>
              <div className="spark-wrap">{win && d.txSeries.length > 1 ? <Sparkline data={d.txSeries} /> : <div className="spark-empty" />}</div>
            </div>
          </section>

          {/* stat grid */}
          <section className="grid">
            <StatCard label={win ? `Transactions (last ~${windowMin} min)` : "Transactions (recent)"}
              value={win ? fmtInt(d.txInWindow) : "…"}
              sub={win && d.txPerDayEst != null ? `≈ ${fmtInt(d.txPerDayEst)} / 24h at current rate` : "scanning recent blocks"} />
            <StatCard label={win ? `Active addresses (last ~${windowMin} min)` : "Active addresses (recent)"}
              value={win ? fmtInt(d.activeAddresses) : "…"}
              sub={win ? `unique over ${d.windowBlocks} blocks` : "scanning recent blocks"} />
            <StatCard label="Latest block" value={fmtInt(d.blockNumber)}
              sub={<a href={`${EXPLORER}/block/${d.blockNumber}`} target="_blank" rel="noopener">view on explorer ↗</a>} />
            <StatCard label="Transfer fee (USD)" value={feeUsd != null ? fmtUsd(feeUsd) : "·"} sub="21,000 gas · USD-denominated" />
            <StatCard label="RBNT price (on-chain)" value={fmtPrice(d.rbntUsd)} sub="WRBNT / stablecoin pools" />
            <StatCard label="WRBNT in pools" value={fmtCompact(d.wrbntLocked)} sub="liquidity locked across reddex" />
            <StatCard label="Block utilization" value={util != null ? `${util < 0.01 ? "<0.01" : util.toFixed(2)}%` : "·"} sub="gas used / gas limit" />
            <StatCard label="Network" value={d.syncing ? "Syncing" : "Healthy"} accent={!d.syncing}
              sub={`chain ${d.chainId} · mainnet`} />
          </section>

          {/* live feeds */}
          <section className="feeds">
            <div className="feed">
              <div className="feed-head"><h2>Live blocks</h2><button className="link" onClick={() => setModal("blocks")}>all ↗</button></div>
              {win ? (
                <div className="rows">
                  {d.recentBlocks.slice(0, 8).map((b) => (
                    <a className="row" key={b.number} href={`${EXPLORER}/block/${b.number}`} target="_blank" rel="noopener">
                      <span className="r-main">#{fmtInt(b.number)}</span>
                      <span className="r-mid">{b.txCount} tx</span>
                      <span className="r-side">{ago(b.timestamp * 1000)}</span>
                    </a>
                  ))}
                </div>
              ) : <div className="muted small">scanning recent blocks…</div>}
            </div>
            <div className="feed">
              <div className="feed-head"><h2>Recent transactions</h2></div>
              {win ? (
                <div className="rows">
                  {d.recentTxs.slice(0, 8).map((t) => (
                    <a className="row" key={t.hash} href={`${EXPLORER}/tx/${t.hash}`} target="_blank" rel="noopener">
                      <span className="r-main mono">{short(t.hash)}</span>
                      <span className="r-mid mono">{short(t.from)} → {short(t.to || "create")}</span>
                      <span className="r-side">{t.valueRbnt > 0 ? `${fmtCompact(t.valueRbnt)} RBNT` : "0"}</span>
                    </a>
                  ))}
                </div>
              ) : <div className="muted small">scanning recent blocks…</div>}
            </div>
          </section>

          {/* partners */}
          <section className="block">
            <h2>Partner assets, live on-chain</h2>
            <p className="muted small">Tokenized-asset and stablecoin deployments on Redbelly mainnet, read live. Click for details.</p>
            <div className="partners">
              {d.partners.map((p) => (
                <button className="partner" key={p.address} onClick={() => setModal({ partner: p })}>
                  <div className="p-sym">{p.symbol}</div>
                  <div className="p-name">{p.name}</div>
                  <div className="p-supply">{fmtCompact(p.totalSupply)} supply</div>
                  <div className="p-addr">{short(p.address)} ›</div>
                </button>
              ))}
            </div>
          </section>

          {/* verified entities */}
          <section className="block">
            <h2>Verified entities</h2>
            <div className="note">
              Redbelly is a permissioned network: every participant is identity-verified at the protocol level via
              Receptor (KYC/KYB), enforced in consensus rather than through a public EVM registry, so a live count is
              not exposed on-chain. We do not fabricate one.
            </div>
          </section>

          <footer className="foot">
            <div>Auto-refresh every {refreshMs / 1000}s · source <code>governors.mainnet.redbelly.network</code> (RPC, direct)</div>
            <div className="muted small">Windowed metrics cover the last ~{WINDOW_BLOCKS} blocks.
              <img src="./mascot.png" alt="" style={{ height: 15, verticalAlign: "-3px", margin: "0 4px" }} /> Built by Smartcoded.</div>
          </footer>
        </>
      )}

      {/* ---- modals ---- */}
      {d && modal === "pools" && (
        <Modal title={`reddex liquidity pools (${d.pools.length})`} onClose={() => setModal(null)}>
          <table className="mtable">
            <thead><tr><th>Pair</th><th>Reserves</th><th>On-chain USD</th></tr></thead>
            <tbody>
              {d.pools.map((p: Pool) => (
                <tr key={p.pair}>
                  <td><a href={`${EXPLORER}/address/${p.pair}`} target="_blank" rel="noopener">{p.sym0}/{p.sym1}</a></td>
                  <td className="mono">{fmtCompact(p.reserve0)} {p.sym0} · {fmtCompact(p.reserve1)} {p.sym1}</td>
                  <td>{p.usd > 0 ? fmtUsd(p.usd) : <span className="muted">unpriced</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">USD reflects on-chain-priceable legs only (stablecoins at $1, WRBNT at the on-chain price). Project-token-only legs are shown as unpriced rather than guessed.</p>
        </Modal>
      )}
      {d && modal === "blocks" && (
        <Modal title="Recent blocks" onClose={() => setModal(null)}>
          <table className="mtable">
            <thead><tr><th>Block</th><th>Txns</th><th>Gas used</th><th>Age</th></tr></thead>
            <tbody>
              {d.recentBlocks.map((b) => (
                <tr key={b.number}>
                  <td><a href={`${EXPLORER}/block/${b.number}`} target="_blank" rel="noopener">#{fmtInt(b.number)}</a></td>
                  <td>{b.txCount}</td><td className="mono">{fmtInt(b.gasUsed)}</td><td>{ago(b.timestamp * 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
      {d && modal && typeof modal === "object" && "partner" in modal && (
        <Modal title={`${modal.partner.symbol} · ${modal.partner.name}`} onClose={() => setModal(null)}>
          <dl className="kv">
            <div><dt>Symbol</dt><dd>{modal.partner.symbol}</dd></div>
            <div><dt>Name</dt><dd>{modal.partner.name}</dd></div>
            <div><dt>Decimals</dt><dd>{modal.partner.decimals}</dd></div>
            <div><dt>Total supply</dt><dd>{fmtInt(modal.partner.totalSupply)}</dd></div>
            <div><dt>Contract</dt><dd className="mono">{modal.partner.address}</dd></div>
          </dl>
          <a className="btn" href={`${EXPLORER}/token/${modal.partner.address}`} target="_blank" rel="noopener">View on explorer ↗</a>
          <p className="muted small">Read live from the chain (name, symbol, decimals, totalSupply) at the latest block.</p>
        </Modal>
      )}
    </div>
  );
}
