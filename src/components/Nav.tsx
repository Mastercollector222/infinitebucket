"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LINKS } from "@/lib/constants";
import { formatUsdChip, formatUsdPrice, truncateAddress } from "@/lib/format";
import { useMarketContext } from "./MarketContext";
import { useBucketPrice } from "@/hooks/useBucket";
import { WalletButton } from "./WalletButton";

const MENU_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/reward-the-holders", label: "Reward the Holders" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export function Nav() {
  const { data } = useMarketContext();
  const bucket = useBucketPrice();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on navigation and on outside taps.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-stroke)] bg-[rgba(10,6,16,0.75)] backdrop-blur-xl">
      <div ref={menuRef} className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center gap-3">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <img
              src="/logo.jpeg"
              alt="Infinite Bucket"
              className="h-9 w-9 rounded-lg border border-[var(--color-stroke)] object-cover"
            />
            <span className="hidden font-display text-base font-bold tracking-tight text-[var(--color-white-soft)] min-[430px]:inline">
              Infinite<span className="text-chrome">Bucket</span>
            </span>
          </Link>

          <div className="flex-1" />

          <div className="hidden items-center gap-1.5 rounded-full border border-[var(--color-live)]/30 bg-[rgba(62,224,164,0.08)] px-3 py-1.5 sm:flex">
            <span className="live-dot" />
            <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] text-[var(--color-live)]">
              LIVE
            </span>
            {data && (
              <span className="font-mono text-xs text-[var(--color-chrome)]">
                {formatUsdPrice(data.priceUsd)}
              </span>
            )}
          </div>

          {bucket && <BucketChip bucket={bucket} />}

          {MENU_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-white/[0.04] hover:text-[var(--color-chrome)] lg:inline"
            >
              {l.label}
            </Link>
          ))}

          <WalletButton />
          <a
            href={LINKS.trade}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-metal shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Buy
          </a>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.6)] text-[var(--color-chrome)] transition hover:border-[rgba(196,160,255,0.35)] lg:hidden"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {open ? (
                <>
                  <path d="M5 5l14 14" />
                  <path d="M19 5L5 19" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden lg:hidden"
            >
              <div className="glass mb-4 mt-1 flex flex-col p-2">
                {MENU_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-xl px-4 py-3.5 text-base font-medium transition hover:bg-white/[0.05] ${
                      pathname === l.href
                        ? "text-[var(--color-white-soft)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-[var(--color-stroke)] px-4 pb-1 pt-3">
                  <span className="flex items-center gap-1.5">
                    <span className="live-dot" />
                    <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] text-[var(--color-live)]">
                      LIVE
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {data && (
                      <span className="font-mono text-sm text-[var(--color-chrome)]">
                        {formatUsdPrice(data.priceUsd)}
                      </span>
                    )}
                    {bucket && <BucketChip bucket={bucket} mobile />}
                  </span>
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// Secondary chip — deliberately quieter than the LIVE $INFINITY pill:
// neutral border, muted label, no live dot. Hidden entirely when the
// feed is down (never a stale hardcoded price).
function BucketChip({
  bucket,
  mobile = false,
}: {
  bucket: { priceUsd: number; change24h: number | null };
  mobile?: boolean;
}) {
  const up = (bucket.change24h ?? 0) >= 0;
  return (
    <span
      title="Bucket Shop Token — what the 75% fee buys. Not financial advice."
      className={`items-center gap-1.5 rounded-full border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.5)] px-2.5 py-1.5 ${
        mobile ? "inline-flex" : "hidden sm:inline-flex"
      }`}
    >
      <span className="font-mono text-[0.6rem] font-semibold tracking-[0.1em] text-[var(--color-muted)]">
        $BUCKET
      </span>
      <span className="font-mono text-xs text-[var(--color-chrome)]">
        {formatUsdChip(bucket.priceUsd)}
      </span>
      {bucket.change24h != null && (
        <span
          className={`font-mono text-[0.6rem] ${
            up ? "text-[var(--color-live)]" : "text-[var(--color-sell)]"
          }`}
        >
          {up ? "+" : ""}
          {bucket.change24h.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
