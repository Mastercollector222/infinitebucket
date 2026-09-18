"use client";

import { useQuery } from "@tanstack/react-query";
import { BUCKET, CHAIN, TOKEN } from "@/lib/constants";
import { compact, formatNumber, timeAgo } from "@/lib/format";

type PayoutsResponse = {
  ok: boolean;
  bucket: number;
  payouts: number;
  lastPayoutTs: number | null;
  lastTx: string | null;
  attributable: boolean;
  error?: string;
};

// "Bucket Shop paid to this wallet from $INFINITY" — sums engine-distributor
// BUCKET transfers to the wallet. Renders nothing when the number can't be
// attributed to INFINITY (wallet holds other launch tokens) or the API fails.
export function PayoutCard({ wallet }: { wallet: string }) {
  const { data, isLoading } = useQuery<PayoutsResponse>({
    queryKey: ["payouts", wallet.toLowerCase()],
    enabled: /^0x[0-9a-fA-F]{40}$/.test(wallet),
    queryFn: async () => {
      const res = await fetch(
        `/api/payouts?wallet=${wallet.toLowerCase()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`payouts ${res.status}`);
      return (await res.json()) as PayoutsResponse;
    },
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3">
        <span className="skeleton inline-block h-4 w-56" />
      </div>
    );
  }
  if (!data?.ok || !data.attributable) return null;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Bucket Shop paid to this wallet from ${TOKEN.symbol}
        </span>
        {data.lastTx && (
          <a
            href={`${CHAIN.explorer}/tx/${data.lastTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-[var(--color-amethyst)] transition hover:text-[var(--color-chrome)]"
          >
            last payout tx ↗
          </a>
        )}
      </div>
      {data.payouts === 0 ? (
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          No IB payouts indexed yet.
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span
            className="font-mono text-xl font-semibold text-[var(--color-buy)]"
            title={formatNumber(Math.round(data.bucket))}
          >
            {compact(data.bucket)} {BUCKET.symbol}
          </span>
          <span className="font-mono text-xs text-[var(--color-muted)]">
            {data.payouts} payout{data.payouts === 1 ? "" : "s"}
            {data.lastPayoutTs != null
              ? ` · last ${timeAgo(data.lastPayoutTs)} ago`
              : ""}
          </span>
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
        Paid by the Bucket Shop engine while holding ${TOKEN.symbol}. Other $
        {BUCKET.symbol} you bought is not counted.
      </p>
    </div>
  );
}
