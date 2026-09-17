"use client";

import { useMarketContext } from "./MarketContext";
import { CountUp } from "./CountUp";
import { LivePill } from "./LivePill";
import { compact, formatNumber, formatUsd, timeAgo } from "@/lib/format";
import { TOKEN } from "@/lib/constants";

// Live proof of the mechanism: real burn + payout numbers from the Bucket Shop
// engine (the same indexer the official launch page reads). Burned total is
// reconciled as: launch supply - current supply = graduation burn + engine
// buy-back-and-burn.
export function EngineStrip({ heading = true }: { heading?: boolean }) {
  const { engine, loading } = useMarketContext();
  const e = engine.engine;
  const first = loading && !e;

  const Skel = ({ w = "w-28" }: { w?: string }) => (
    <span className={`skeleton inline-block h-8 ${w}`} />
  );

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
            {TOKEN.symbol} burned
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
            {first ? (
              <Skel />
            ) : e?.burnedTotal != null ? (
              <CountUp value={e.burnedTotal} format={(n) => (n == null ? "—" : compact(n))} />
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs leading-relaxed text-[var(--color-muted)]">
            {e?.burnedAtGraduation != null && e?.burnedInfinity != null ? (
              <>
                {compact(e.burnedAtGraduation)} unsold, burned at graduation ·{" "}
                {compact(e.burnedInfinity)} engine buy-back
              </>
            ) : (
              "Removed from supply"
            )}
          </span>
        </div>

        <div className="glass flex flex-col gap-2 p-6">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Fees to holders
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-buy)]">
            {first ? (
              <Skel />
            ) : e?.paidToHoldersTokenUsd != null ? (
              <CountUp value={e.paidToHoldersTokenUsd} format={(n) => formatUsd(n)} />
            ) : e?.paidToHoldersUsd != null ? (
              <CountUp value={e.paidToHoldersUsd} format={(n) => formatUsd(n)} />
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs leading-relaxed text-[var(--color-muted)]">
            {e?.paidToHoldersTokenUsd != null ? (
              <>
                USDG routed to {TOKEN.symbol} payouts
                {e.infinityToHolders != null
                  ? ` · +${compact(e.infinityToHolders)} ${TOKEN.symbol}`
                  : ""}
                {e.paidToHoldersUsd != null
                  ? ` · engine lifetime: ${formatUsd(e.paidToHoldersUsd)}`
                  : ""}
              </>
            ) : (
              "Bucket Shop engine · lifetime"
            )}
          </span>
        </div>

        <div className="glass flex flex-col gap-2 p-6">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Pending in jar
          </span>
          <span className="font-mono text-3xl font-semibold text-[var(--color-white-soft)]">
            {first ? <Skel w="w-24" /> : e?.jarUsd != null ? formatUsd(e.jarUsd) : "—"}
          </span>
          <span className="text-xs leading-relaxed text-[var(--color-muted)]">
            {e?.lastPaydayTs
              ? `Last payout ${timeAgo(e.lastPaydayTs * 1000)} ago`
              : "Awaiting next payday"}
            {e?.stalled ? " · engine catching up" : ""}
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
        Supply check: {formatNumber(TOKEN.totalSupply)} minted
        {e?.supplyNow != null ? `, ${formatNumber(Math.round(e.supplyNow))} now` : ""}. Holder
        payouts convert to BUCKET before distribution. Source: Bucket Shop launch indexer.
      </p>
    </section>
  );
}
