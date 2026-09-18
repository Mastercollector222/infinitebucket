import { LINKS, CHAIN, TOKEN } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-stroke)] bg-[rgba(7,4,12,0.6)]">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="max-w-xl">
          <div className="font-display text-lg font-extrabold">
            Infinite<span className="text-chrome">Bucket</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
            $INFINITY is an ERC-20 on {CHAIN.name} (chain {CHAIN.id}). Holder payouts are made
            in Bucket Shop Token. This site is informational and is not financial advice.
            Nothing here is an offer, and no price, listing, or Robinhood app inclusion is
            promised.
          </p>
          <div className="mt-5">
            <a
              href={LINKS.trade}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-metal inline-block rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              Buy INFINITY
            </a>
          </div>
          <p className="mt-4 break-all font-mono text-xs leading-relaxed text-[var(--color-muted)]">
            CA{" "}
            <a
              href={LINKS.blockscoutToken}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-chrome)] transition hover:text-white"
            >
              {TOKEN.address}
            </a>
          </p>
        </div>
        <div className="mt-10 border-t border-[var(--color-stroke)] pt-6 text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} InfiniteBucket · {CHAIN.name} only
        </div>
      </div>
    </footer>
  );
}
