"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { CopyCA } from "@/components/CopyCA";
import { CHAIN, LINKS, TOKEN } from "@/lib/constants";
import { compact, formatNumber, truncateAddress } from "@/lib/format";

type Entry = {
  address: string;
  balance: number;
  username?: string | null;
  avatar_url?: string | null;
  index?: number;
};

type GiveawayData = {
  phase: "before" | "after";
  cutoffTs: number;
  gate: number;
  estimate?: Entry[];
  snapshotBlock?: { number: number; hash: string | null; ts: number | null };
  eligible?: Entry[];
  winner?: { index: number; address: string; hashUint: string; mod: number } | null;
  approximate?: boolean;
  payoutTx?: string | null;
  ok: boolean;
  error?: string;
};

const PAGE = 10;

export default function RewardPage() {
  const { data, isLoading } = useQuery<GiveawayData>({
    queryKey: ["giveaway"],
    queryFn: async () => {
      const res = await fetch("/api/giveaway", { cache: "no-store" });
      if (!res.ok) throw new Error(`giveaway ${res.status}`);
      return (await res.json()) as GiveawayData;
    },
    refetchInterval: 60_000,
  });
  const [page, setPage] = useState(0);

  const list = (data?.phase === "after" ? data.eligible : data?.estimate) ?? [];
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="mx-auto max-w-3xl py-10 pb-24">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Reward the <span className="text-chrome">Holders</span>
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        No deposit. We read the chain. One winner. 50 USDG.
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
        Cutoff: 20 Sep 2026, 5:00 PM Mountain Standard Time (21 Sep 2026 00:00
        UTC).
      </p>

      <div className="glass mt-6 flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Prize
          </div>
          <div className="font-display text-2xl font-extrabold text-chrome">
            50 USDG
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Sent by the creator wallet after the snapshot. This site never
            holds funds.
          </p>
        </div>
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Rule
          </div>
          <p className="mt-1 text-[var(--color-white-soft)]">
            Hold{" "}
            <span className="font-mono font-semibold">5,000,000</span> $
            {TOKEN.symbol} in one wallet through the cutoff.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="glass mt-6 h-64 animate-pulse" />
      ) : !data?.ok ? (
        <p className="glass mt-6 px-4 py-10 text-center text-sm text-[var(--color-muted)]">
          Giveaway data unavailable right now.
        </p>
      ) : data.phase === "before" ? (
        <>
          <Countdown cutoffTs={data.cutoffTs} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={LINKS.trade}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-metal rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              Buy INFINITY
            </a>
            <CopyCA variant="button" label="Copy CA" />
          </div>
          <h2 className="mt-8 font-display text-xl font-bold tracking-tight">
            Live estimate{" "}
            <span className="text-sm font-medium text-[var(--color-muted)]">
              · not the official snapshot list
            </span>
          </h2>
          <EntryTable
            rows={slice}
            startRank={page * PAGE}
            winnerIndex={null}
            empty="No wallets currently meet the 5,000,000 threshold."
          />
        </>
      ) : (
        <>
          <div className="glass mt-6 flex flex-col gap-2 p-6">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              Snapshot block (nearest block at or before cutoff)
            </span>
            <span className="font-mono text-lg font-semibold text-[var(--color-white-soft)]">
              #{data.snapshotBlock ? formatNumber(data.snapshotBlock.number) : "—"}
            </span>
            {data.snapshotBlock?.hash && (
              <a
                href={`${CHAIN.explorer}/block/${data.snapshotBlock.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-xs text-[var(--color-amethyst)] transition hover:text-[var(--color-chrome)]"
              >
                {data.snapshotBlock.hash}
              </a>
            )}
            {data.snapshotBlock?.ts != null && (
              <span className="text-xs text-[var(--color-muted)]">
                {new Date(data.snapshotBlock.ts * 1000).toUTCString()}
              </span>
            )}
          </div>

          {data.winner && (
            <div className="glass mt-6 border-[rgba(196,160,255,0.45)] p-6">
              <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                Winner
              </span>
              <div className="mt-2 flex items-center gap-3">
                <Avatar
                  url={
                    data.eligible?.[data.winner.index]?.avatar_url ?? null
                  }
                  wallet={data.winner.address}
                  username={
                    data.eligible?.[data.winner.index]?.username ?? null
                  }
                  size={48}
                />
                <div>
                  {data.eligible?.[data.winner.index]?.username ? (
                    <Link
                      href={`/u/${encodeURIComponent(
                        data.eligible[data.winner.index].username!,
                      )}`}
                      className="font-display text-xl font-extrabold text-[var(--color-white-soft)] hover:text-white"
                    >
                      {data.eligible[data.winner.index].username}
                    </Link>
                  ) : (
                    <Link
                      href={`/u/${data.winner.address}`}
                      className="font-mono text-lg font-semibold text-[var(--color-chrome)] hover:text-white"
                    >
                      {truncateAddress(data.winner.address)}
                    </Link>
                  )}
                  <div className="font-mono text-xs text-[var(--color-muted)]">
                    {truncateAddress(data.winner.address, 8)}
                  </div>
                </div>
              </div>
              <p className="mt-3 break-all font-mono text-xs leading-relaxed text-[var(--color-muted)]">
                uint({data.snapshotBlock?.hash}) mod {data.winner.mod} ={" "}
                {data.winner.index} → eligible[{data.winner.index}]
              </p>
              {data.payoutTx ? (
                <a
                  href={`${CHAIN.explorer}/tx/${data.payoutTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-[var(--color-buy)] transition hover:text-white"
                >
                  50 USDG payout tx ↗
                </a>
              ) : (
                <p className="mt-3 text-xs text-[var(--color-muted)]">
                  Payout pending — 50 USDG is sent by the creator wallet, not
                  by this site.
                </p>
              )}
            </div>
          )}

          <h2 className="mt-8 font-display text-xl font-bold tracking-tight">
            Eligible wallets{" "}
            <span className="text-sm font-medium text-[var(--color-muted)]">
              · {data.eligible?.length ?? 0} at snapshot
            </span>
          </h2>
          <EntryTable
            rows={slice}
            startRank={page * PAGE}
            winnerIndex={data.winner?.index ?? null}
            empty="No wallets met the 5,000,000 threshold at the snapshot."
          />
        </>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-[var(--color-stroke)] px-3 py-1.5 text-[var(--color-muted)] transition enabled:hover:text-white disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="font-mono text-xs text-[var(--color-muted)]">
            {page + 1} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="rounded-lg border border-[var(--color-stroke)] px-3 py-1.5 text-[var(--color-muted)] transition enabled:hover:text-white disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[var(--color-muted)]">
        Excluded: pool liquidity, burn addresses, and the creator wallet.
        {data?.phase === "after" && data.approximate
          ? " Snapshot balances could not be fully reconstructed (log range unavailable) — latest indexed balances are shown instead."
          : data?.phase === "after"
            ? " Snapshot balances are reconstructed from on-chain Transfer events — any wallet that held INFINITY at the block is counted exactly."
            : " The estimate uses the latest indexed balances, not the snapshot."}{" "}
        Not financial advice.
      </p>
    </div>
  );
}

function Countdown({ cutoffTs }: { cutoffTs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor(cutoffTs - now / 1000));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <div className="glass mt-6 p-6">
      <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        Snapshot in
      </span>
      <div className="mt-1 font-mono text-3xl font-bold text-[var(--color-white-soft)]">
        {d > 0 ? `${d}d ` : ""}
        {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:
        {String(s).padStart(2, "0")}
      </div>
      <span className="text-xs text-[var(--color-muted)]">
        {new Date(cutoffTs * 1000).toUTCString()}
      </span>
    </div>
  );
}

function EntryTable({
  rows,
  startRank,
  winnerIndex,
  empty,
}: {
  rows: Entry[];
  startRank: number;
  winnerIndex: number | null;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="glass mt-3 px-4 py-8 text-center text-sm text-[var(--color-muted)]">
        {empty}
      </p>
    );
  }
  return (
    <ol className="glass mt-3 flex flex-col overflow-hidden">
      {rows.map((e, i) => {
        // Eligible rows carry their array index (the winner math references
        // eligible[i]); the estimate list shows a simple 1-based rank.
        const isWinner =
          e.index != null && winnerIndex != null && e.index === winnerIndex;
        return (
          <li
            key={e.address}
            className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3 last:border-0 ${
              isWinner ? "bg-[rgba(139,92,246,0.12)]" : ""
            }`}
          >
            <span className="font-mono text-sm text-[var(--color-muted)]">
              {e.index != null ? e.index : startRank + i + 1}
            </span>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                url={e.avatar_url}
                wallet={e.address}
                username={e.username}
                size={32}
              />
              <div className="min-w-0">
                {e.username ? (
                  <Link
                    href={`/u/${encodeURIComponent(e.username)}`}
                    className="block truncate font-display text-sm font-bold text-[var(--color-white-soft)] hover:text-white"
                  >
                    {e.username}
                  </Link>
                ) : (
                  <Link
                    href={`/u/${e.address}`}
                    className="block truncate font-mono text-sm text-[var(--color-chrome)] hover:text-white"
                  >
                    {truncateAddress(e.address)}
                  </Link>
                )}
                <div className="truncate font-mono text-xs text-[var(--color-muted)]">
                  {e.username ? truncateAddress(e.address) : ""}
                  {isWinner && (
                    <span className="ml-2 rounded border border-[var(--color-amethyst)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-amethyst)]">
                      WINNER
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className="text-right font-mono text-sm font-semibold text-[var(--color-white-soft)]"
              title={formatNumber(Math.round(e.balance))}
            >
              {compact(e.balance)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
