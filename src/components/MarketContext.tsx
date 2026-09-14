"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMarket, type MarketState } from "@/hooks/useMarket";
import { useTokenStats, type TokenStatsState } from "@/hooks/useTokenStats";

type MarketContextValue = MarketState & { token: TokenStatsState };

const MarketContext = createContext<MarketContextValue | null>(null);

// Single polling instance shared across nav ticker, live strip, hero, tape.
export function MarketProvider({ children }: { children: ReactNode }) {
  const market = useMarket();
  const token = useTokenStats();
  return (
    <MarketContext.Provider value={{ ...market, token }}>{children}</MarketContext.Provider>
  );
}

export function useMarketContext(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarketContext must be used within MarketProvider");
  return ctx;
}
