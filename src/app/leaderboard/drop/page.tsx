"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthContext";
import { CHAIN } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";
import { DropTable, type DropBoardItem } from "./DropTable";

type BoardResponse = {
  ok: boolean;
  week_id: string;
  is_current: boolean;
  items: DropBoardItem[];
  meta: { prize_usdg: number; closed: boolean; payout_tx: string | null };
  previous: {
    week_id: string;
    winner: DropBoardItem | null;
    prize_usdg: number;
    payout_tx: string | null;
  } | null;
};

// Next Monday 00:00 UTC — weekly board close.
function nextMondayUtcMs(): number {
  const d = new Date();
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
}

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${h}:${m}:${sec}` : `${h}:${m}:${sec}`;
}

// Drop · This week — weekly board from drop_week_scores. Resets Monday
// 00:00 UTC; the winner is paid manually by the creator (no custody here).
export default function DropWeeklyBoard() {
  const { address } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, isError } = useQuery<BoardResponse>({
    queryKey: ["drop-board-week"],
    queryFn: async () => {
      const res = await fetch("/api/drop/board?scope=week", { cache: "no-store" });
      if (!res.ok) throw new Error(`board ${res.status}`);
      return (await res.json()) as BoardResponse;
    },
    refetchInterval: 60_000,
  });

  const prize = data?.meta.prize_usdg ?? 10;
  const left = nextMondayUtcMs() - now;

  return (
    <div className="mx-auto max-w-3xl py-10 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Drop · <span className="text-chrome">This week</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
            Weekly Drop board. Wins reset Monday 00:00 UTC. All-time stays.
            First week prize: {prize} USDG to #1. Not gambling — no buy-in,
            prize from creator bag. Not financial advice.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-2.5 text-right">
          <div className="text-[0.6rem] uppercase tracking-wide text-[var(--color-muted)]">
            {data?.meta.closed ? "Closed" : "Closes in"}
          </div>
          <div className="font-mono text-sm font-semibold text-[var(--color-white-soft)]">
            {data?.meta.closed ? `Week ${data.week_id}` : fmtLeft(left)}
          </div>
        </div>
      </div>

      {data?.meta.closed ? (
        <div className="mt-4 rounded-xl border border-[rgba(196,160,255,0.35)] bg-[rgba(168,85,247,0.08)] px-4 py-3 text-sm text-[var(--color-chrome)]">
          Week {data.week_id} closed.{" "}
          {data.meta.payout_tx ? (
            <>
              Payout:{" "}
              <a
                href={`${CHAIN.explorer}/tx/${data.meta.payout_tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs underline decoration-[var(--color-amethyst)] underline-offset-2 hover:text-white"
              >
                {truncateAddress(data.meta.payout_tx, 10)}
              </a>
            </>
          ) : (
            "Payout pending — the creator sends it after close."
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3 text-sm text-[var(--color-muted)]">
          #1 at close receives {prize} USDG. We send it. No deposit.
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="glass flex flex-col">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3.5 last:border-0">
                <span className="skeleton h-4 w-6" />
                <span className="skeleton h-8 w-8 rounded-full" />
                <span className="skeleton h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : isError || !data?.ok ? (
          <div className="glass px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            Board unavailable right now.
          </div>
        ) : (
          <DropTable items={data.items} highlightWallet={address} showGames />
        )}
      </div>

      {data?.previous && (
        <div className="mt-6 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Week {data.previous.week_id} winner
          </span>
          <span className="ml-3 text-sm text-[var(--color-white-soft)]">
            {data.previous.winner
              ? `${data.previous.winner.username ?? truncateAddress(data.previous.winner.wallet)} — ${data.previous.winner.wins} wins`
              : "No scored matches"}
          </span>
          <span className="ml-3 font-mono text-xs text-[var(--color-muted)]">
            {data.previous.prize_usdg} USDG
            {data.previous.payout_tx ? (
              <>
                {" · "}
                <a
                  href={`${CHAIN.explorer}/tx/${data.previous.payout_tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-chrome)] hover:text-white"
                >
                  payout tx
                </a>
              </>
            ) : (
              " · payout pending"
            )}
          </span>
        </div>
      )}
    </div>
  );
}
