"use client";

import { useMarketContext } from "./MarketContext";
import { CountUp } from "./CountUp";
import { compact, formatUsd, timeAgo } from "@/lib/format";
import { TOKEN } from "@/lib/constants";

// Single live engine row: burned / paid to holders / pending — real Bucket
// Shop indexer numbers only. A card with no real value is hidden; if none of
// the data is real, the whole row renders nothing.
export function EngineStrip() {
  const { engine, loading } = useMarketContext();
  const e = engine.engine;
  const first = loading && !e;

  const burned = e?.burnedTotal ?? null;
  const paid = e?.paidToHoldersTokenUsd ?? e?.paidToHoldersUsd ?? null;
  const pending = e?.jarUsd ?? null;

  if (!first && burned == null && paid == null && pending == null) return null;

  return (
    <section className="py-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {(first || burned != null) && (
          <div className="glass flex flex-col gap-2 p-6">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {TOKEN.symbol} burned
            </span>
            <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
              {first ? (
                <span className="skeleton inline-block h-8 w-28" />
              ) : (
                <CountUp value={burned} format={(n) => (n == null ? "—" : compact(n))} />
              )}
            </span>
            <span className="text-xs leading-relaxed text-[var(--color-muted)]">
              {e?.burnedAtGraduation != null && e?.burnedInfinity != null
                ? `${compact(e.burnedAtGraduation)} at graduation · ${compact(e.burnedInfinity)} engine buy-back`
                : "Removed from supply"}
            </span>
          </div>
        )}

        {(first || paid != null) && (
          <div className="glass flex flex-col gap-2 p-6">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              Paid to holders
            </span>
            <span className="font-mono text-3xl font-semibold text-[var(--color-buy)]">
              {first ? (
                <span className="skeleton inline-block h-8 w-28" />
              ) : (
                <CountUp value={paid} format={(n) => formatUsd(n)} />
              )}
            </span>
            <span className="text-xs leading-relaxed text-[var(--color-muted)]">
              {e?.paidToHoldersTokenUsd != null
                ? `USDG routed to ${TOKEN.symbol} payouts — converts to Bucket Shop Token`
                : "Bucket Shop engine · lifetime"}
            </span>
          </div>
        )}

        {(first || pending != null) && (
          <div className="glass flex flex-col gap-2 p-6">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              Pending in jar
            </span>
            <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
              {first ? (
                <span className="skeleton inline-block h-8 w-24" />
              ) : (
                formatUsd(pending)
              )}
            </span>
            <span className="text-xs leading-relaxed text-[var(--color-muted)]">
              {e?.lastPaydayTs
                ? `Last payout ${timeAgo(e.lastPaydayTs * 1000)} ago`
                : "Awaiting next payday"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
