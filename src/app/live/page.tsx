"use client";

import { LiveStrip } from "@/components/LiveStrip";
import { EngineStrip } from "@/components/EngineStrip";
import { TradeTape } from "@/components/TradeTape";
import { LivePill } from "@/components/LivePill";
import { CopyCA } from "@/components/CopyCA";
import { useMarketContext } from "@/components/MarketContext";
import { formatUsd, formatPercent } from "@/lib/format";
import { LINKS } from "@/lib/constants";

export default function LivePage() {
  const { data, loading, lastUpdated } = useMarketContext();
  const change = data?.change24h ?? null;
  const up = change != null && change >= 0;

  return (
    <div className="flex flex-col gap-8 py-12 pb-28 lg:pb-16">
      <section className="glass flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LivePill />
            <span className="font-mono text-xs text-[var(--color-muted)]">INFINITY / USDG</span>
          </div>
          <span className="text-xs text-[var(--color-muted)]">
            {lastUpdated ? `updated ${new Date(lastUpdated).toLocaleTimeString()}` : "connecting…"}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <span className="font-mono text-5xl font-bold text-[var(--color-white-soft)] sm:text-7xl">
            {loading && !data ? (
              <span className="skeleton inline-block h-16 w-64" />
            ) : (
              formatUsd(data?.priceUsd)
            )}
          </span>
          {change != null && (
            <span
              className={`font-mono text-2xl ${
                up ? "text-[var(--color-buy)]" : "text-[var(--color-sell)]"
              }`}
            >
              {formatPercent(change)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={LINKS.trade}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-metal rounded-xl px-6 py-3.5 text-base font-semibold"
          >
            Buy INFINITY
          </a>
          <CopyCA variant="button" label="Copy CA" />
          <a
            href={LINKS.geckoterminal}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost rounded-xl px-5 py-3.5 text-sm font-medium"
          >
            Open pool ↗
          </a>
        </div>
      </section>

      <LiveStrip />
      <EngineStrip />
      <TradeTape limit={20} />
    </div>
  );
}
