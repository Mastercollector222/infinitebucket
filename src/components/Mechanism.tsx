"use client";

import { motion } from "framer-motion";
import { FEE_SPLIT } from "./FeeSplit";

const STEPS = [
  {
    n: "01",
    title: "Launch on Bucket",
    body: "InfiniteBucket was launched on Bucket Shop on Robinhood Chain — no presale mechanics invented here.",
  },
  {
    n: "02",
    title: "Trade vs USDG",
    body: "INFINITY trades against USDG in a Uniswap v4 pool. Every swap charges a 4% fee.",
  },
  {
    n: "03",
    title: "Fees into the engine",
    body: "Bucket Shop routes the creator share of the 4% fee across payouts, buy-back-and-burn, the locked pool, and the creator wallet.",
  },
  {
    n: "04",
    title: "Payouts to holders",
    body: "75% of the creator share is pushed back to holders through BucketShop. Holders are paid in Bucket Shop Token (100%). There is no claim button.",
  },
];

// Creator-published split of the creator share of the 4% swap fee — shared
// copy lives in FeeSplit so the labels never drift.

export function Mechanism({ heading = true }: { heading?: boolean }) {
  return (
    <section className="py-4">
      {heading && (
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            How the bucket <span className="text-chrome">stays full</span>
          </h2>
          <p className="mt-3 text-[var(--color-muted)]">
            The 4% swap fee flows back to holders through BucketShop. Here is the honest flow with
            the creator&apos;s published split.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
            className="glass relative flex flex-col gap-3 p-5"
          >
            <span className="font-mono text-sm text-[var(--color-amethyst)]">{s.n}</span>
            <h3 className="font-display text-lg font-bold text-[var(--color-white-soft)]">
              {s.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">{s.body}</p>
            {i < STEPS.length - 1 && (
              <span className="pointer-events-none absolute -right-2 top-1/2 hidden text-[var(--color-stroke)] lg:block">
                →
              </span>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-lg font-bold text-[var(--color-chrome)]">
            Fee split
          </h3>
          <span className="font-mono text-sm text-[var(--color-amethyst)]">
            4% swap fee · creator share
          </span>
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
      </div>

      <p className="mt-6 rounded-xl border border-[var(--color-stroke)] bg-[rgba(226,196,138,0.06)] px-4 py-3 text-sm text-[var(--color-gold)]">
        Figures are set by the creator at launch. Holders are paid in Bucket Shop Token. This is
        not financial advice and no yield is promised.
      </p>
    </section>
  );
}
