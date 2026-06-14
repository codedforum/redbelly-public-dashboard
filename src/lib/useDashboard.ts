import { useEffect, useRef, useState, useCallback } from "react";
import { fetchSnapshot, fetchFast, type Snapshot } from "./metrics";

const REFRESH_MS = 60_000;   // task requires >= 60s
const CACHE_KEY = "redbelly_dashboard_snapshot";

type State = {
  data: Snapshot | null;
  loading: boolean;
  stale: boolean;       // true when the latest refresh failed but we have prior data
  error: string | null;
  lastSuccess: number | null;
};

function loadCache(): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function useDashboard() {
  const cached = loadCache();
  const [state, setState] = useState<State>({
    data: cached,
    loading: !cached,
    stale: Boolean(cached), // until the first live success, treat cache as stale
    error: null,
    lastSuccess: cached?.fetchedAt ?? null,
  });
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snap = await fetchSnapshot();
      // bigint is not JSON-serializable; store a plain copy for the cache.
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify(snap, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
        );
      } catch {}
      setState({ data: snap, loading: false, stale: false, error: null, lastSuccess: snap.fetchedAt });
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        stale: Boolean(s.data),
        error: e?.shortMessage || e?.message || "RPC request failed",
      }));
    }
  }, []);

  // First paint: show fast metrics ASAP, then fill in the windowed scan.
  const firstLoad = useCallback(async () => {
    try {
      const fast = await fetchFast();
      setState((s) => ({ ...s, data: s.data ?? fast, loading: false, stale: false, lastSuccess: fast.fetchedAt }));
    } catch { /* the full refresh below will surface any error */ }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    firstLoad();
    const tick = () => {
      timer.current = window.setTimeout(async () => {
        await refresh();
        tick();
      }, REFRESH_MS);
    };
    tick();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [refresh]);

  return { ...state, refresh, refreshMs: REFRESH_MS };
}
