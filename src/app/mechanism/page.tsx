import type { Metadata } from "next";
import { Mechanism } from "@/components/Mechanism";
import { CopyCA } from "@/components/CopyCA";
import { LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Mechanism — InfiniteBucket",
  description:
    "How the 4% Bucket Shop swap fee is split and paid back to holders through BucketShop.",
};

const NOTES = [
  {
    q: "Is there a claim button?",
    a: "No. The engine pushes payouts to holders through BucketShop automatically. There is nothing to claim manually.",
  },
  {
    q: "What is the fee?",
    a: "4% per swap. The creator share of that fee is what funds the split below.",
  },
  {
    q: "How is the creator share split?",
    a: "75% to holder payouts, 15% buy back and burn, 5% into the locked pool, and 5% to the creator wallet.",
  },
  {
    q: "What are holders paid in?",
    a: "BUCKET, 100% — routed to holders through BucketShop, not tokenized stocks.",
  },
];

export default function MechanismPage() {
  return (
    <div className="flex flex-col gap-14 py-14 pb-28 lg:pb-16">
      <section className="max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          How the <span className="text-chrome">engine</span> works
        </h1>
        <p className="mt-4 text-[var(--color-muted)]">
          InfiniteBucket launched on Bucket Shop. Every swap charges a 4% fee, and the creator
          share of that fee is routed back to holders through BucketShop. Below is the honest flow
          with the creator&apos;s published split.
        </p>
      </section>

      <Mechanism heading={false} />

      <section>
        <h2 className="mb-6 font-display text-2xl font-bold">Straight answers</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {NOTES.map((n) => (
            <div key={n.q} className="glass p-5">
              <h3 className="font-display font-bold text-[var(--color-white-soft)]">{n.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{n.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="font-display text-2xl font-bold">Trade on Uniswap</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Swapping USDG → INFINITY on Robinhood Chain is what generates the fees.
          </p>
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
        </div>
      </section>
    </div>
  );
}
