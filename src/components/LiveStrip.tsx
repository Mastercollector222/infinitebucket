"use client";

import { useMarketContext } from "./MarketContext";
import { CountUp } from "./CountUp";
import { useChainToken } from "@/hooks/useChainToken";
import { TOKEN } from "@/lib/constants";
import { formatUsd, formatPercent, compact } from "@/lib/format";

type Stat = {
  label: string;
  render: () => React.ReactNode;
};

// The single live stats row. Supply is the on-chain totalSupply read — minted
// 1B, burns already reduced it.
export function LiveStrip() {
  const { data, token, loading, stale, lastUpdated } = useMarketContext();
  const chain = useChainToken();

  const change = data?.change24h ?? null;
  const changeTone =
    change == null
      ? "text-[var(--color-chrome)]"
      : change >= 0
        ? "text-[var(--color-buy)]"
        : "text-[var(--color-sell)]";

  const stats: Stat[] = [
    {
      label: "Price",
      render: () => (
        <CountUp value={data?.priceUsd ?? null} format={(n) => formatUsd(n)} />
      ),
    },
    {
      label: "24h",
      render: () => <span className={changeTone}>{formatPercent(change)}</span>,
    },
    {
      label: "Liquidity",
      render: () => (
        <CountUp
          value={data?.liquidityUsd ?? null}
          format={(n) => formatUsd(n, { compact: true })}
        />
      ),
    },
    {
      label: "24h Volume",
      render: () => (
        <CountUp
          value={data?.volume24h ?? null}
          format={(n) => formatUsd(n, { compact: true })}
        />
      ),
    },
    {
      label: "Holders",
      render: () =>
        token.stats?.holders != null ? (
          <CountUp value={token.stats.holders} format={(n) => (n == null ? "—" : compact(n))} />
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      label: `Live supply`,
      render: () =>
        chain.totalSupply != null ? (
          <CountUp
            value={chain.totalSupply}
            format={(n) => (n == null ? "—" : `${compact(n)} ${TOKEN.symbol}`)}
          />
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
  ];

  return (
    <section className="glass p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-[var(--color-chrome)]">
          Live market
        </span>
        <div className="flex items-center gap-3">
          {stale && (
            <span className="text-xs text-[var(--color-gold)]">
              last good value · source stale
            </span>
          )}
          {data?.source && (
            <span className="text-xs text-[var(--color-muted)]">
              via {data.source}
              {lastUpdated ? ` · ${new Date(lastUpdated).toLocaleTimeString()}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {s.label}
            </span>
            <span className="font-mono text-lg font-semibold text-[var(--color-white-soft)] sm:text-xl">
              {loading && !data ? (
                <span className="skeleton inline-block h-6 w-20" />
              ) : (
                s.render()
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
