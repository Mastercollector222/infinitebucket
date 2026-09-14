import Link from "next/link";
import { LINKS, SOCIALS, CHAIN } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-stroke)] bg-[rgba(7,4,12,0.6)]">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="font-display text-lg font-extrabold">
              Infinite<span className="text-chrome">Bucket</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              $INFINITY is an ERC-20 on {CHAIN.name} (chain {CHAIN.id}). This site is
              informational and is not financial advice. Nothing here is an offer, and no price,
              listing, or Robinhood app inclusion is promised.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {SOCIALS.x && (
                <a
                  href={SOCIALS.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="InfiniteBucket on X"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-stroke)] text-[var(--color-chrome)] transition hover:border-[rgba(196,160,255,0.4)] hover:text-white"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
                  </svg>
                </a>
              )}
              {SOCIALS.telegram && (
                <a
                  href={SOCIALS.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="InfiniteBucket on Telegram"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-stroke)] text-[var(--color-chrome)] transition hover:border-[rgba(196,160,255,0.4)] hover:text-white"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M21.94 4.5 2.9 11.84c-1.3.52-1.29 1.25-.24 1.57l4.88 1.52 1.9 5.83c.24.64.12.9.79.9.51 0 .74-.24 1.02-.51l2.44-2.37 5.07 3.75c.93.51 1.6.25 1.84-.87l3.32-15.66c.34-1.35-.51-1.97-1.98-1.03Z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-12">
            <div className="flex flex-col gap-2 text-sm">
              <span className="mb-1 text-xs uppercase tracking-wide text-[var(--color-muted)]">
                Pages
              </span>
              <Link href="/token" className="text-[var(--color-chrome)] hover:text-white">
                Token
              </Link>
              <Link href="/mechanism" className="text-[var(--color-chrome)] hover:text-white">
                Mechanism
              </Link>
              <Link href="/live" className="text-[var(--color-chrome)] hover:text-white">
                Live
              </Link>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <span className="mb-1 text-xs uppercase tracking-wide text-[var(--color-muted)]">
                Official
              </span>
              <a
                href={LINKS.launch}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-chrome)] hover:text-white"
              >
                Bucket Shop
              </a>
              <a
                href={LINKS.geckoterminal}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-chrome)] hover:text-white"
              >
                GeckoTerminal
              </a>
              <a
                href={LINKS.blockscoutToken}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-chrome)] hover:text-white"
              >
                Blockscout
              </a>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-[var(--color-stroke)] pt-6 text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} InfiniteBucket · {CHAIN.name} only · Not financial advice.
        </div>
      </div>
    </footer>
  );
}
