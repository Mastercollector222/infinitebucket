"use client";

import { CHAIN, QUOTE, TOKEN } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { useChainToken } from "@/hooks/useChainToken";

// One row of token facts. Supply is honest: minted 1B, live figure is the
// on-chain totalSupply read (burns already reduced it).
export function FactsRow() {
  const chain = useChainToken();

  const facts: { label: string; value: string; verified?: boolean }[] = [
    { label: "Minted", value: `${formatNumber(TOKEN.totalSupply)} ${TOKEN.symbol}` },
    {
      label: "Live supply",
      value:
        chain.totalSupply != null
          ? `${formatNumber(Math.round(chain.totalSupply))} ${TOKEN.symbol}`
          : "—",
      verified: chain.totalSupply != null,
    },
    { label: "Decimals", value: String(TOKEN.decimals) },
    { label: "Standard", value: TOKEN.standard },
    { label: "Chain", value: String(CHAIN.id) },
    { label: "Pair", value: QUOTE.symbol },
    { label: "DEX", value: "Uniswap v4" },
    { label: "Contract", value: "Unverified" },
  ];

  return (
    <section className="glass flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-5 sm:px-6">
      {facts.map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            {f.label}
          </span>
          <span className="font-mono text-sm font-semibold text-[var(--color-white-soft)]">
            {f.verified ? "✓ " : ""}
            {f.value}
          </span>
        </div>
      ))}
    </section>
  );
}
