import type { Metadata } from "next";
import { CopyCA } from "@/components/CopyCA";
import { AddChainButton } from "@/components/AddChainButton";
import { OfficialLinks } from "@/components/OfficialLinks";
import { TokenFacts } from "@/components/TokenFacts";
import { TOKEN, QUOTE, CHAIN, POOL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Token — $INFINITY | InfiniteBucket",
  description: "Contract, supply, and how to add Robinhood Chain to your wallet.",
};

const rows: { label: string; value: string; mono?: boolean }[] = [
  { label: "Name", value: TOKEN.name },
  { label: "Symbol", value: TOKEN.symbol },
  { label: "Contract", value: TOKEN.address, mono: true },
  { label: "Standard", value: TOKEN.standard },
  { label: "Decimals", value: String(TOKEN.decimals) },
  { label: "Total supply", value: `${TOKEN.totalSupply.toLocaleString()} ${TOKEN.symbol}` },
  { label: "Quote token", value: `${QUOTE.symbol} · ${QUOTE.address}`, mono: true },
  { label: "USDG decimals", value: String(QUOTE.decimals) },
  { label: "Uniswap v4 PoolManager", value: POOL.poolManager, mono: true },
];

export default function TokenPage() {
  return (
    <div className="flex flex-col gap-16 py-14 pb-28 lg:pb-16">
      <section>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          The <span className="text-chrome">$INFINITY</span> contract
        </h1>
        <p className="mt-4 max-w-xl text-[var(--color-muted)]">
          Everything you need to verify and interact with the token on {CHAIN.name}. The contract
          is currently unverified — treat it accordingly and never assume it is audited.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <CopyCA variant="button" label="Copy CA" />
          <AddChainButton />
        </div>

        <div className="glass mt-8 overflow-hidden">
          <dl className="divide-y divide-[var(--color-stroke)]">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <dt className="text-sm uppercase tracking-wide text-[var(--color-muted)]">
                  {r.label}
                </dt>
                <dd
                  className={`text-[var(--color-white-soft)] ${
                    r.mono ? "break-all font-mono text-sm" : ""
                  }`}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="glass p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold">Add Robinhood Chain manually</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          If the one-click button is unavailable, add the network with these exact values.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ["Network name", CHAIN.name],
            ["RPC URL", CHAIN.rpcUrl],
            ["Chain ID", `${CHAIN.id} (${CHAIN.idHex})`],
            ["Currency symbol", CHAIN.nativeCurrency.symbol],
            ["Block explorer", CHAIN.explorer],
            ["Testnet chain ID", `${CHAIN.testnetId} (do not use)`],
          ].map(([label, value]) => (
            <div key={label} className="hairline rounded-xl p-4">
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                {label}
              </dt>
              <dd className="mt-1 break-all font-mono text-sm text-[var(--color-chrome)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <TokenFacts />
      <OfficialLinks />
    </div>
  );
}
