"use client";

import { TOKEN, QUOTE, CHAIN } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { useChainToken } from "@/hooks/useChainToken";

// Section F: token facts, cross-checked against on-chain reads where possible.
export function TokenFacts() {
  const chain = useChainToken();

  const onChainSupply =
    chain.totalSupply != null ? formatNumber(Math.round(chain.totalSupply)) : null;

  const facts: { label: string; value: string; note?: string; verified?: boolean }[] = [
    {
      label: "Total supply",
      value: `${formatNumber(TOKEN.totalSupply)} ${TOKEN.symbol}`,
      note: onChainSupply ? `on-chain: ${onChainSupply}` : "fixed",
      verified: onChainSupply != null,
    },
    {
      label: "Decimals",
      value: String(TOKEN.decimals),
      note: chain.decimals != null ? `on-chain: ${chain.decimals}` : undefined,
      verified: chain.decimals != null,
    },
    { label: "Standard", value: TOKEN.standard },
    { label: "Network", value: `${CHAIN.name} · ${CHAIN.id}` },
    { label: "Quote pair", value: `${QUOTE.symbol} (decimals ${QUOTE.decimals})` },
    { label: "Liquidity", value: "Uniswap v4" },
    {
      label: "Symbol",
      value: chain.symbol ?? TOKEN.symbol,
      note: chain.symbol ? "on-chain" : undefined,
      verified: chain.symbol != null,
    },
    { label: "Contract status", value: "Unverified", note: "not audited" },
  ];

  return (
    <section className="py-4">
      <div className="mb-8 max-w-2xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Token <span className="text-chrome">facts</span>
        </h2>
        <p className="mt-3 text-[var(--color-muted)]">
          Marketing values checked against a live on-chain read on {CHAIN.name}.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="glass flex flex-col gap-1.5 p-5">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {f.label}
            </span>
            <span className="font-mono text-lg text-[var(--color-white-soft)]">{f.value}</span>
            {f.note && (
              <span
                className={`text-xs ${
                  f.verified ? "text-[var(--color-buy)]" : "text-[var(--color-muted)]"
                }`}
              >
                {f.verified ? "✓ " : ""}
                {f.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
