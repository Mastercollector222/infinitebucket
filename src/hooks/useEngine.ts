"use client";

import { useEffect, useRef, useState } from "react";
import type { EngineStats } from "@/lib/types";
import { fetchEngineDirect } from "@/lib/engine";

export type EngineState = {
  engine: EngineStats | null;
  loading: boolean;
  stale: boolean;
};

// Bucket Shop engine stats. Tries the /api/engine proxy first (shared cache);
// if the host can't reach the indexer (datacenter IP blocks), falls back to a
// direct browser fetch — the indexer is CORS-open. Keeps last good value.
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
      let stats: EngineStats | null = null;
      try {
        const res = await fetch("/api/engine", { cache: "no-store" });
        const json: EngineStats = await res.json();
        if (json.ok) stats = json;
      } catch {
        /* proxy unreachable — try direct below */
      }
      if (!stats) {
        try {
          const direct = await fetchEngineDirect();
          if (direct.ok) stats = direct;
        } catch {
          /* both paths failed */
        }
      }
      if (!mounted.current) return;
      setState((prev) =>
        stats
          ? { engine: stats, loading: false, stale: false }
          : { ...prev, loading: false, stale: prev.engine != null },
      );
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
