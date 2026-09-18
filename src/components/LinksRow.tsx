import { LINKS, SOCIALS } from "@/lib/constants";

const OFFICIAL = [
  { label: "Uniswap", desc: "Trade INFINITY / USDG", href: LINKS.trade },
  { label: "Dexscreener", desc: "Official chart · USDG v4", href: LINKS.dexscreener },
  { label: "Blockscout", desc: "Explorer", href: LINKS.blockscoutToken },
  { label: "Bucket Shop", desc: "Launch page", href: LINKS.launch },
  { label: "X", desc: "@InfinityBucket_", href: SOCIALS.x },
  { label: "Telegram", desc: "InfiniteBucket", href: SOCIALS.telegram },
];

const MORE = [
  { label: "GeckoTerminal", desc: "Pool data", href: LINKS.geckoterminal },
  { label: "Robinscanner", desc: "Token scanner", href: LINKS.robinscanner },
];

// Homepage links section: one row of official destinations, secondary
// trackers tucked behind a "More" disclosure.
export function LinksRow() {
  return (
    <section className="py-4">
      <h2 className="mb-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Official <span className="text-chrome">links</span>
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {OFFICIAL.map((l) => (
          <LinkCard key={l.label} {...l} />
        ))}
      </div>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[var(--color-stroke)] px-3.5 py-2 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-chrome)] [&::-webkit-details-marker]:hidden">
          More
          <span className="transition group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {MORE.map((l) => (
            <LinkCard key={l.label} {...l} />
          ))}
        </div>
      </details>
    </section>
  );
}

function LinkCard({ label, desc, href }: { label: string; desc: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="glass group flex items-center justify-between px-4 py-3.5 transition hover:border-[rgba(196,160,255,0.35)]"
    >
      <div>
        <div className="font-display text-sm font-bold text-[var(--color-white-soft)]">
          {label}
        </div>
        <div className="text-xs text-[var(--color-muted)]">{desc}</div>
      </div>
      <span className="text-[var(--color-amethyst)] transition group-hover:translate-x-0.5">↗</span>
    </a>
  );
}
