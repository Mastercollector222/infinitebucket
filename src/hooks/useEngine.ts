"use client";

import { useEffect, useRef, useState } from "react";
import type { EngineStats } from "@/lib/types";

export type EngineState = {
  engine: EngineStats | null;
  loading: boolean;
  stale: boolean;
};

// Bucket Shop engine stats (burned + payouts). Refreshed every 20s, keeps last
// good value on failure.
export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({
    engine: null,
    loading: true,
    stale: false,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      try {
        const res = await fetch("/api/engine", { cache: "no-store" });
        const json: EngineStats = await res.json();
        if (!mounted.current) return;
        setState((prev) => {
          if (!json.ok) return { ...prev, loading: false, stale: prev.engine != null };
          return { engine: json, loading: false, stale: false };
        });
      } catch {
        if (!mounted.current) return;
        setState((prev) => ({ ...prev, loading: false, stale: prev.engine != null }));
      }
    };
    load();
    const id = setInterval(load, 20_000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
