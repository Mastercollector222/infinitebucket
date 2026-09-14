"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMarketContext } from "./MarketContext";
import { formatUsd, timeAgo } from "@/lib/format";

// Section D: last swaps. Buy green / sell red. Empty state if the source
// gives none. New rows slide in.
export function TradeTape({ limit = 12 }: { limit?: number }) {
  const { trades, loading } = useMarketContext();
  const rows = trades.slice(0, limit);

  return (
    <section className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-stroke)] px-5 py-3">
        <h3 className="font-display text-sm font-bold tracking-tight text-[var(--color-chrome)]">
          Trade tape
        </h3>
        <span className="text-xs text-[var(--color-muted)]">INFINITY / USDG</span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="divide-y divide-[var(--color-stroke)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <span className="skeleton h-4 w-10" />
              <span className="skeleton h-4 w-24" />
              <span className="skeleton ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-muted)]">
          No recent swaps reported by the data source yet.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-stroke)]">
          <AnimatePresence initial={false}>
            {rows.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span
                  className={`inline-flex w-11 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                    t.side === "buy"
                      ? "bg-[rgba(61,220,151,0.12)] text-[var(--color-buy)]"
                      : "bg-[rgba(255,93,122,0.12)] text-[var(--color-sell)]"
                  }`}
                >
                  {t.side === "buy" ? "Buy" : "Sell"}
                </span>
                <span className="font-mono text-[var(--color-chrome)]">
                  {formatUsd(t.priceUsd)}
                </span>
                <span className="hidden font-mono text-[var(--color-muted)] sm:inline">
                  {t.amountUsd != null ? formatUsd(t.amountUsd, { compact: true }) : "—"}
                </span>
                <span className="ml-auto font-mono text-xs text-[var(--color-muted)]">
                  {timeAgo(t.timestamp)} ago
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
