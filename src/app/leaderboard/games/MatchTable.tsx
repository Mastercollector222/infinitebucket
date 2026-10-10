"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { truncateAddress } from "@/lib/format";

export type MatchBoardItem = {
  wallet: string;
  max_level: number;
  username: string | null;
  avatar_url: string | null;
  eligible: boolean | null;
};

// Shared Match board rows — rank, profile (claimed username+avatar or bare
// wallet), best level, and a 5M+ chip when the wallet holds enough INFINITY
// to qualify for cash rewards. Highlighted row = connected wallet.
export function MatchTable({
  items,
  highlightWallet,
}: {
  items: MatchBoardItem[];
  highlightWallet?: string;
}) {
  const hl = highlightWallet?.toLowerCase();
  return (
    <div className="glass overflow-hidden">
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-2.5 text-xs uppercase tracking-wide text-[var(--color-muted)] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]">
        <span>#</span>
        <span>Player</span>
        <span className="text-right" title="Holds ≥5,000,000 $INFINITY — reward eligible">
          Reward
        </span>
        <span className="text-right">Level</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
          No saved runs yet — clear a level to take the board.
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((it, i) => (
            <li
              key={it.wallet}
              className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3 last:border-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto] ${
                hl === it.wallet ? "bg-[rgba(168,85,247,0.10)]" : ""
              }`}
            >
              <span className="font-mono text-sm text-[var(--color-muted)]">{i + 1}</span>
              <Link
                href={`/u/${encodeURIComponent(it.username ?? it.wallet)}`}
                className="group flex min-w-0 items-center gap-3"
              >
                <Avatar url={it.avatar_url} wallet={it.wallet} username={it.username} size={32} />
                <div className="min-w-0">
                  <span className="block truncate font-display text-sm font-bold text-[var(--color-white-soft)] transition group-hover:text-white">
                    {it.username ?? truncateAddress(it.wallet)}
                  </span>
                  {it.username && (
                    <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                      {truncateAddress(it.wallet)}
                    </span>
                  )}
                </div>
              </Link>
              <span className="text-right">
                {it.eligible ? (
                  <span
                    title="Holds ≥5,000,000 $INFINITY — qualifies for cash rewards"
                    className="rounded-md border border-[var(--color-live)]/40 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--color-live)]"
                  >
                    5M+
                  </span>
                ) : (
                  <span className="font-mono text-xs text-[var(--color-muted)]">—</span>
                )}
              </span>
              <span className="text-right font-mono text-sm font-semibold text-[var(--color-white-soft)]">
                {it.max_level}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
