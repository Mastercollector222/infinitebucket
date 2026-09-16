"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMarket, type MarketState } from "@/hooks/useMarket";
import { useTokenStats, type TokenStatsState } from "@/hooks/useTokenStats";
import { useEngine, type EngineState } from "@/hooks/useEngine";

type MarketContextValue = MarketState & { token: TokenStatsState; engine: EngineState };

const MarketContext = createContext<MarketContextValue | null>(null);

// Single polling instance shared across nav ticker, live strip, hero, tape.
export function MarketProvider({ children }: { children: ReactNode }) {
  const market = useMarket();
  const token = useTokenStats();
  const engine = useEngine();
  return (
    <MarketContext.Provider value={{ ...market, token, engine }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarketContext(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarketContext must be used within MarketProvider");
  return ctx;
}
