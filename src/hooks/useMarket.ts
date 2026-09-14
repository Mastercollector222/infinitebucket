"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REFRESH_MS } from "@/lib/constants";
import type { MarketResponse } from "@/lib/types";

export type MarketState = {
  data: MarketResponse["data"] | null;
  trades: MarketResponse["trades"];
  loading: boolean; // true only until first successful load
  stale: boolean; // last fetch failed, showing last good value
  lastUpdated: number | null;
};

// SWR-style polling every REFRESH_MS. Keeps last good value on failure and
// flags `stale` instead of ever rendering 0 / empty over real data.
export function useMarket(): MarketState {
  const [state, setState] = useState<MarketState>({
    data: null,
    trades: [],
    loading: true,
    stale: false,
    lastUpdated: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      const json: MarketResponse = await res.json();
      if (!mounted.current) return;
      const good = json.ok && json.data.priceUsd != null;
      setState((prev) => {
        if (!good) {
          // keep last good data, mark stale
          return { ...prev, loading: false, stale: prev.data != null };
        }
        return {
          data: json.data,
          trades: json.trades?.length ? json.trades : prev.trades,
          loading: false,
          stale: false,
          lastUpdated: Date.now(),
        };
      });
    } catch {
      if (!mounted.current) return;
      setState((prev) => ({ ...prev, loading: false, stale: prev.data != null }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  return state;
}
