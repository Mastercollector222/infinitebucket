"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthContext";
import { CHAIN } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";
import { DropTable, type DropBoardItem } from "../DropTable";
import { MatchTable, type MatchBoardItem } from "../MatchTable";

type DropBoardResponse = { ok: boolean; scope: string; items: DropBoardItem[] };
type RaceEvent = {
  ends_at: string;
  prize_usdg: number;
  closed: boolean;
  winner: { wallet: string; username: string | null } | null;
  prize_level: number | null;
  payout_tx: string | null;
};
type MatchBoardResponse = {
  ok: boolean;
  items: MatchBoardItem[];
  event: RaceEvent | null;
};

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${h}:${m}:${sec}` : `${h}:${m}:${sec}`;
}

// All time game leaderboard — per-game sections that never reset. Drop shows
// career wins (drop_scores); Match shows best level (game_progress). More
// games slot in as sections as they ship.
export default function AllTimeGamesBoard() {
  const { address } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const drop = useQuery<DropBoardResponse>({
    queryKey: ["drop-board-all"],
    queryFn: async () => {
      const res = await fetch("/api/drop/board?scope=all", { cache: "no-store" });
      if (!res.ok) throw new Error(`board ${res.status}`);
      return (await res.json()) as DropBoardResponse;
    },
    refetchInterval: 60_000,
  });

  const match = useQuery<MatchBoardResponse>({
    queryKey: ["match-board-all"],
    queryFn: async () => {
      const res = await fetch("/api/game/progress?game=match", { cache: "no-store" });
      if (!res.ok) throw new Error(`board ${res.status}`);
      return (await res.json()) as MatchBoardResponse;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl py-10 pb-24">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        All time game <span className="text-chrome">leaderboard</span>
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
        Career records across every game since day one. Does not reset — the
        weekly board is where the prize lives.
      </p>

      <h2 className="mt-8 font-display text-lg font-bold tracking-tight text-[var(--color-white-soft)]">
        Drop <span className="ml-1 text-sm font-medium text-[var(--color-muted)]">— career wins</span>
      </h2>
      <div className="mt-4">
        {drop.isLoading ? (
          <SkeletonRows />
        ) : drop.isError || !drop.data?.ok ? (
          <Unavailable />
        ) : (
          <DropTable items={drop.data.items} highlightWallet={address} />
        )}
      </div>

      <h2 className="mt-10 font-display text-lg font-bold tracking-tight text-[var(--color-white-soft)]">
        Match <span className="ml-1 text-sm font-medium text-[var(--color-muted)]">— best level</span>
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Free to play. Cash rewards require 5,000,000 $INFINITY held in the
        wallet.
      </p>
      {match.data?.event && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[rgba(196,160,255,0.35)] bg-[rgba(168,85,247,0.08)] px-4 py-2.5 text-sm text-[var(--color-chrome)]">
          {match.data.event.closed ? (
            <span>
              Race closed — winner:{" "}
              {match.data.event.winner ? (
                <Link
                  href={`/u/${encodeURIComponent(match.data.event.winner.username ?? match.data.event.winner.wallet)}`}
                  className="font-semibold hover:text-white"
                >
                  {match.data.event.winner.username ?? truncateAddress(match.data.event.winner.wallet)}
                </Link>
              ) : (
                "no eligible player"
              )}
              {match.data.event.prize_level != null &&
                ` · level ${match.data.event.prize_level}`}
              {match.data.event.payout_tx ? (
                <>
                  {" · "}
                  <a
                    href={`${CHAIN.explorer}/tx/${match.data.event.payout_tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs underline decoration-[var(--color-amethyst)] underline-offset-2 hover:text-white"
                  >
                    payout tx
                  </a>
                </>
              ) : (
                " · payout pending"
              )}
            </span>
          ) : (
            <span>
              Race: {match.data.event.prize_usdg} USDG to #1 in{" "}
              <span className="font-mono font-semibold">
                {fmtLeft(Date.parse(match.data.event.ends_at) - now)}
              </span>{" "}
              — 5M+ $INFINITY to qualify
            </span>
          )}
        </div>
      )}
      <div className="mt-4">
        {match.isLoading ? (
          <SkeletonRows />
        ) : match.isError || !match.data?.ok ? (
          <Unavailable />
        ) : (
          <MatchTable items={match.data.items} highlightWallet={address} />
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="glass flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3.5 last:border-0">
          <span className="skeleton h-4 w-6" />
          <span className="skeleton h-8 w-8 rounded-full" />
          <span className="skeleton h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="glass px-4 py-10 text-center text-sm text-[var(--color-muted)]">
      Board unavailable right now.
    </div>
  );
}
