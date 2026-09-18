"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useChainToken } from "@/hooks/useChainToken";
import { CHAIN, TOKEN } from "@/lib/constants";
import { compact, formatNumber, truncateAddress } from "@/lib/format";

type HolderRow = {
  rank: number;
  address: string;
  amount: number | null;
  label: string | null;
  username: string | null;
  avatar_url: string | null;
};

type HoldersResponse = {
  holders: HolderRow[];
  updatedAt: number;
  ok: boolean;
  error?: string;
};

// Top on-chain holders, enriched with claimed profiles. Refreshes every
// 5 minutes; the API route caches the Blockscout pull for the same window.
export default function LeaderboardPage() {
  const { data, isLoading, isError } = useQuery<HoldersResponse>({
    queryKey: ["holders"],
    queryFn: async () => {
      const res = await fetch("/api/holders", { cache: "no-store" });
      if (!res.ok) throw new Error(`holders ${res.status}`);
      return (await res.json()) as HoldersResponse;
    },
    refetchInterval: 300_000,
    staleTime: 60_000,
  });
  const chain = useChainToken();
  const supply = chain.totalSupply;

  const holders = data?.holders ?? [];

  return (
    <div className="mx-auto max-w-3xl py-10 pb-24">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Leader<span className="text-chrome">board</span>
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        Top holders on-chain. Profiles appear after a wallet connects and picks a
        username.
      </p>

      <div className="glass mt-6 overflow-hidden">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_3.5rem] items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-2.5 text-xs uppercase tracking-wide text-[var(--color-muted)] sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem]">
          <span>#</span>
          <span>Holder</span>
          <span className="text-right">{TOKEN.symbol}</span>
          <span className="text-right">%</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3.5 last:border-0"
              >
                <span className="skeleton h-4 w-6" />
                <span className="skeleton h-8 w-8 rounded-full" />
                <span className="skeleton h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : isError || !data?.ok || holders.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            Holder data unavailable right now.
          </p>
        ) : (
          <ol className="flex flex-col">
            {holders.map((h) => (
              <Row key={h.address} h={h} supply={supply} />
            ))}
          </ol>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
        Connected wallet?{" "}
        <Link href="/profile" className="text-[var(--color-chrome)] hover:text-white">
          Claim your profile
        </Link>{" "}
        to appear here by name. Balances from{" "}
        <a
          href={`${CHAIN.explorer}/token/${TOKEN.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-chrome)] hover:text-white"
        >
          Blockscout
        </a>
        .
      </p>
    </div>
  );
}

function Row({ h, supply }: { h: HolderRow; supply: number | null }) {
  const pct =
    h.amount != null && supply != null && supply > 0
      ? (h.amount / supply) * 100
      : null;

  const profile = h.label ? (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar url={null} wallet={h.address} username={null} size={32} />
      <div className="min-w-0">
        <span className="inline-block rounded-md border border-[var(--color-stroke)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]">
          {h.label}
        </span>
        <div className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted)]">
          {truncateAddress(h.address)}
        </div>
      </div>
    </div>
  ) : h.username ? (
    <Link
      href={`/u/${encodeURIComponent(h.username)}`}
      className="group flex min-w-0 items-center gap-3"
    >
      <Avatar url={h.avatar_url} wallet={h.address} username={h.username} size={32} />
      <div className="min-w-0">
        <div className="truncate font-display text-sm font-bold text-[var(--color-white-soft)] transition group-hover:text-white">
          {h.username}
        </div>
        <div className="truncate font-mono text-xs text-[var(--color-muted)]">
          {truncateAddress(h.address)}
        </div>
      </div>
    </Link>
  ) : (
    <Link
      href={`/u/${h.address}`}
      className="group flex min-w-0 items-center gap-3"
    >
      <Avatar url={null} wallet={h.address} username={null} size={32} />
      <span className="truncate font-mono text-sm text-[var(--color-chrome)] transition group-hover:text-white">
        {truncateAddress(h.address)}
      </span>
    </Link>
  );

  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_3.5rem] items-center gap-3 border-b border-[var(--color-stroke)] px-4 py-3 last:border-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem]">
      <span className="font-mono text-sm text-[var(--color-muted)]">{h.rank}</span>
      {profile}
      <span
        className="text-right font-mono text-sm font-semibold text-[var(--color-white-soft)]"
        title={h.amount != null ? formatNumber(Math.round(h.amount)) : undefined}
      >
        {compact(h.amount)}
      </span>
      <span className="text-right font-mono text-xs text-[var(--color-muted)] sm:text-sm">
        {pct == null ? "—" : pct >= 0.01 ? `${pct.toFixed(2)}%` : "<0.01%"}
      </span>
    </li>
  );
}
