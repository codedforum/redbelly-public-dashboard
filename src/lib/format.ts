export const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtUsd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCompact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function fmtPrice(n: number | null) {
  if (n == null) return "n/a";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// USD cost of a 21,000-gas native transfer, using the on-chain RBNT price.
// gasPriceWei may be a bigint (live) or a string (restored from cache).
export function transferFeeUsd(gasPriceWei: bigint | string, rbntUsd: number | null): number | null {
  if (rbntUsd == null) return null;
  const gp = typeof gasPriceWei === "bigint" ? gasPriceWei : BigInt(gasPriceWei || "0");
  const rbnt = Number(gp * 21000n) / 1e18;
  return rbnt * rbntUsd;
}
