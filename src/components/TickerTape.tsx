"use client";

import { useMarketContext } from "./MarketContext";
import { formatUsd, formatPercent, compact } from "@/lib/format";
import { TOKEN } from "@/lib/constants";

// Slim marquee tape under the nav. Purely presentational restatement of the
// live stats. Loops via duplicated content.
export function TickerTape() {
  const { data, token } = useMarketContext();

  const items: { label: string; value: string; tone?: "buy" | "sell" }[] = [
    { label: "PRICE", value: formatUsd(data?.priceUsd) },
    {
      label: "24H",
      value: formatPercent(data?.change24h),
      tone: data?.change24h != null ? (data.change24h >= 0 ? "buy" : "sell") : undefined,
    },
    { label: "LIQ", value: formatUsd(data?.liquidityUsd, { compact: true }) },
    { label: "VOL 24H", value: formatUsd(data?.volume24h, { compact: true }) },
    { label: "FDV", value: formatUsd(data?.fdv, { compact: true }) },
    {
      label: "HOLDERS",
      value: token.stats?.holders != null ? compact(token.stats.holders) : "—",
    },
    { label: "SUPPLY", value: `${compact(TOKEN.totalSupply)} ${TOKEN.symbol}` },
  ];

  const row = (
    <div className="marquee-track">
      {[0, 1].map((dup) => (
        <div key={dup} className="flex items-center">
          {items.map((it, i) => (
            <span key={`${dup}-${i}`} className="flex items-center px-5 text-xs">
              <span className="text-[var(--color-muted)]">{it.label}</span>
              <span
                className={`ml-2 font-mono ${
                  it.tone === "buy"
                    ? "text-[var(--color-buy)]"
                    : it.tone === "sell"
                      ? "text-[var(--color-sell)]"
                      : "text-[var(--color-chrome)]"
                }`}
              >
                {it.value}
              </span>
              <span className="ml-5 text-[var(--color-stroke)]">•</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden border-y border-[var(--color-stroke)] bg-[rgba(7,4,12,0.5)] py-2">
      {row}
    </div>
  );
}
