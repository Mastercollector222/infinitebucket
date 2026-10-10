"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { compact, truncateAddress } from "@/lib/format";

export type DropBoardItem = {
  wallet: string;
  wins: number;
  games: number | null;
  username: string | null;
  avatar_url: string | null;
  badge: { name: string; color: string } | null;
};

// Shared Drop board rows — rank, profile (claimed username+avatar+badge or
// bare wallet), wins. Highlighted row = connected wallet.
export function DropTable({
  items,
  highlightWallet,
  showGames,
}: {
  items: DropBoardItem[];
  highlightWallet?: string;
  showGames?: boolean;
}) {
  const hl = highlightWallet?.toLowerCase();
  return (
    <div className="glass overflow-hidden">
      <div
        className={`grid items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-2.5 text-xs uppercase tracking-wide text-[var(--color-muted)] ${
          showGames
            ? "grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"
            : "grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
        }`}
      >
        <span>#</span>
        <span>Player</span>
        {showGames && <span className="text-right">Matches</span>}
        <span className="text-right">Wins</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
          No scored matches yet — first win takes the board.
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((it, i) => (
            <li
              key={it.wallet}
              className={`grid items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3 last:border-0 ${
                showGames
                  ? "grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"
                  : "grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
              } ${hl === it.wallet ? "bg-[rgba(168,85,247,0.10)]" : ""}`}
            >
              <span className="font-mono text-sm text-[var(--color-muted)]">{i + 1}</span>
              <Link
                href={`/u/${encodeURIComponent(it.username ?? it.wallet)}`}
                className="group flex min-w-0 items-center gap-3"
              >
                <Avatar url={it.avatar_url} wallet={it.wallet} username={it.username} size={32} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-[var(--color-white-soft)] transition group-hover:text-white">
                      {it.username ?? truncateAddress(it.wallet)}
                    </span>
                    {it.badge && (
                      <span
                        className="shrink-0 rounded-md border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
                        style={{ borderColor: `${it.badge.color}55`, color: it.badge.color }}
                      >
                        {it.badge.name}
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--color-muted)]">
                    {it.username ? truncateAddress(it.wallet) : ""}
                  </div>
                </div>
              </Link>
              {showGames && (
                <span className="text-right font-mono text-xs text-[var(--color-muted)]">
                  {it.games ?? "—"}
                </span>
              )}
              <span className="text-right font-mono text-sm font-semibold text-[var(--color-white-soft)]">
                {compact(it.wins)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
