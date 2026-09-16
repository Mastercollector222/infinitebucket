"use client";

import { useMarketContext } from "./MarketContext";
import { CountUp } from "./CountUp";
import { LivePill } from "./LivePill";
import { compact, formatUsd, timeAgo } from "@/lib/format";
import { TOKEN } from "@/lib/constants";

// Live proof of the mechanism: real burn + payout numbers from the Bucket Shop
// engine (official launch-page indexer). Honest labels — the USD figure is the
// engine-wide lifetime total, the burn is INFINITY-specific.
export function EngineStrip({ heading = true }: { heading?: boolean }) {
  const { engine, loading } = useMarketContext();
  const e = engine.engine;
  const first = loading && !e;

  return (
    <section className="py-4">
      {heading && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              The engine, <span className="text-chrome">live</span>
            </h2>
            <p className="mt-3 text-[var(--color-muted)]">
              Real numbers from Bucket Shop, not projections. Payouts arrive on their own — there
              is nothing to claim.
            </p>
          </div>
          <LivePill />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass flex flex-col gap-2 p-6">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {TOKEN.symbol} bought back &amp; burned
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
            {first ? (
              <span className="skeleton inline-block h-8 w-28" />
            ) : e?.burnedInfinity != null ? (
              <CountUp value={e.burnedInfinity} format={(n) => (n == null ? "—" : compact(n))} />
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            Removed from supply by the engine
          </span>
        </div>

        <div className="glass flex flex-col gap-2 p-6">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Fees paid to holders
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-buy)]">
            {first ? (
              <span className="skeleton inline-block h-8 w-28" />
            ) : e?.paidToHoldersUsd != null ? (
              <CountUp value={e.paidToHoldersUsd} format={(n) => formatUsd(n)} />
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            Bucket Shop engine · lifetime, all launches
          </span>
        </div>

        <div className="glass flex flex-col gap-2 p-6">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Pending in jar
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
            {first ? (
              <span className="skeleton inline-block h-8 w-24" />
            ) : e?.jarUsd != null ? (
              formatUsd(e.jarUsd)
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            {e?.lastPaydayTs
              ? `Last payout ${timeAgo(e.lastPaydayTs * 1000)} ago`
              : "Awaiting next payday"}
            {e?.stalled ? " · engine catching up" : ""}
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs text-[var(--color-muted)]">
        Burn is {TOKEN.symbol}-specific. The payout figure is the Bucket Shop engine&apos;s
        lifetime total across all launches — a per-token USD breakdown is not published by the
        source, so it is not invented here.
      </p>
    </section>
  );
}
