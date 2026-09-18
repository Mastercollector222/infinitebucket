"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { LivePill } from "./LivePill";
import { useMarketContext } from "./MarketContext";
import { formatUsd } from "@/lib/format";
import { LINKS } from "@/lib/constants";

export function Nav() {
  const pathname = usePathname();
  const { data, loading } = useMarketContext();

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="border-b border-[var(--color-stroke)] bg-[rgba(7,4,12,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.jpeg"
              alt="InfiniteBucket"
              width={34}
              height={34}
              className="rounded-lg"
              priority
            />
            <span className="font-display text-lg font-extrabold tracking-tight text-[var(--color-white-soft)]">
              Infinite<span className="text-chrome">Bucket</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 xs:flex">
              <LivePill />
              <span className="font-mono text-sm text-[var(--color-chrome)]">
                {loading && !data ? (
                  <span className="skeleton inline-block h-4 w-16" />
                ) : (
                  formatUsd(data?.priceUsd)
                )}
              </span>
            </div>
            <Link
              href="/profile"
              className={`hidden rounded-lg px-3 py-1.5 text-sm transition sm:inline ${
                pathname === "/profile"
                  ? "bg-[rgba(28,20,44,0.7)] text-[var(--color-white-soft)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-chrome)]"
              }`}
            >
              Profile
            </Link>
            <WalletButton />
            <a
              href={LINKS.trade}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-metal rounded-xl px-3.5 py-2.5 text-sm font-semibold sm:px-4"
            >
              Buy
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
