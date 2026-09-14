"use client";

import { LINKS } from "@/lib/constants";
import { CopyCA } from "./CopyCA";
import { useMarketContext } from "./MarketContext";
import { formatUsd } from "@/lib/format";

// Mobile-only sticky action bar: keeps Buy + CA copy one tap away.
export function StickyBuy() {
  const { data } = useMarketContext();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-stroke)] bg-[rgba(7,4,12,0.9)] px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            INFINITY
          </span>
          <span className="font-mono text-sm text-[var(--color-chrome)]">
            {formatUsd(data?.priceUsd)}
          </span>
        </div>
        <CopyCA className="ml-auto" />
        <a
          href={LINKS.trade}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-metal rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Buy
        </a>
      </div>
    </div>
  );
}
