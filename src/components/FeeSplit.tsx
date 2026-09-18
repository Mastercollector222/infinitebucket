// Creator-published split of the creator share of the 4% swap fee.
// Copy lock: payouts are Bucket Shop Token; the split totals 100%.
export const FEE_SPLIT = [
  { pct: "75%", label: "Payouts to holders", note: "Paid in Bucket Shop Token" },
  { pct: "15%", label: "Buyback and burn", note: "INFINITY removed from supply" },
  { pct: "5%", label: "Liquidity", note: "Into the locked pool" },
  { pct: "5%", label: "Creator", note: "To the creator wallet" },
];

// Homepage mechanism section: two lines of context, then the split grid.
export function FeeSplit() {
  return (
    <section className="py-4">
      <div className="mb-8 max-w-2xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          How the bucket <span className="text-chrome">stays full</span>
        </h2>
        <p className="mt-3 text-[var(--color-muted)]">
          Launched on Bucket Shop on Robinhood Chain.
        </p>
        <p className="mt-1 text-[var(--color-muted)]">
          Trades INFINITY / USDG on Uniswap v4. 4% fee uses the split below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEE_SPLIT.map((d) => (
          <div key={d.label} className="glass flex flex-col gap-1 p-5">
            <span className="font-display text-3xl font-extrabold text-chrome">{d.pct}</span>
            <span className="font-display text-sm font-bold text-[var(--color-white-soft)]">
              {d.label}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{d.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
