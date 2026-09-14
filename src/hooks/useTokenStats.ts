"use client";

import { useEffect, useRef, useState } from "react";
import type { TokenStats } from "@/lib/types";

export type TokenStatsState = {
  stats: TokenStats | null;
  loading: boolean;
  stale: boolean;
};

// Holders / transfers from Blockscout. Refreshed at a slower cadence (30s)
// than market data. Keeps last good value on failure.
export function useTokenStats(): TokenStatsState {
  const [state, setState] = useState<TokenStatsState>({
    stats: null,
    loading: true,
    stale: false,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      try {
        const res = await fetch("/api/token", { cache: "no-store" });
        const json: TokenStats = await res.json();
        if (!mounted.current) return;
        setState((prev) => {
          if (!json.ok) return { ...prev, loading: false, stale: prev.stats != null };
          return { stats: json, loading: false, stale: false };
        });
      } catch {
        if (!mounted.current) return;
        setState((prev) => ({ ...prev, loading: false, stale: prev.stats != null }));
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
