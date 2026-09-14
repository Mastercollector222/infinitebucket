"use client";

import { useMarketContext } from "./MarketContext";

// Pulsing LIVE pill. Falls back to a static "stale" state on source failure.
export function LivePill({ className = "" }: { className?: string }) {
  const { stale, loading, data } = useMarketContext();
  const hasData = data != null;
  const isStale = stale || (!loading && !hasData);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-2.5 py-1 text-[11px] font-medium tracking-wide ${className}`}
    >
      <span className={`live-dot ${isStale ? "stale-dot" : ""}`} />
      <span className={isStale ? "text-[var(--color-gold)]" : "text-[var(--color-buy)]"}>
        {isStale ? "STALE" : "LIVE"}
      </span>
    </span>
  );
}
