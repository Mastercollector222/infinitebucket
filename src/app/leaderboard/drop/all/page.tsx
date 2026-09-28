"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthContext";
import { DropTable, type DropBoardItem } from "../DropTable";

type BoardResponse = { ok: boolean; scope: string; items: DropBoardItem[] };

// Drop · All time — career wins from drop_scores. Never resets.
export default function DropAllTimeBoard() {
  const { address } = useAuth();
  const { data, isLoading, isError } = useQuery<BoardResponse>({
    queryKey: ["drop-board-all"],
    queryFn: async () => {
      const res = await fetch("/api/drop/board?scope=all", { cache: "no-store" });
      if (!res.ok) throw new Error(`board ${res.status}`);
      return (await res.json()) as BoardResponse;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl py-10 pb-24">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Drop · <span className="text-chrome">All time</span>
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
        Career wins across every match since day one. Does not reset — the
        weekly board is where the prize lives.
      </p>

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
          <DropTable items={data.items} highlightWallet={address} />
        )}
      </div>
    </div>
  );
}
