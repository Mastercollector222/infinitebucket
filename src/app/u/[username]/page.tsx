"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { supabase, type UserRow } from "@/lib/supabase";
import { useAuth } from "@/components/AuthContext";
import { erc20Abi } from "@/lib/abi";
import { CHAIN, LINKS, TOKEN } from "@/lib/constants";
import { compact, truncateAddress } from "@/lib/format";

// Public read-only profile for a claimed username. Edit affordance only
// appears when the connected wallet owns the row.
export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const name = decodeURIComponent(params.username ?? "");
  const { address } = useAuth();

  const { data: row, isLoading } = useQuery({
    queryKey: ["profile", name],
    enabled: Boolean(supabase && name),
    queryFn: async (): Promise<UserRow | null> => {
      const { data, error } = await supabase!
        .from("users")
        .select("*")
        .eq("username", name)
        .maybeSingle();
      if (error) throw error;
      return (data as UserRow | null) ?? null;
    },
  });

  const wallet = row?.wallet as `0x${string}` | undefined;
  const { data: balanceRaw } = useReadContract({
    address: TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    chainId: CHAIN.id,
    query: { enabled: Boolean(wallet) },
  });
  const balance =
    balanceRaw != null ? Number(formatUnits(balanceRaw as bigint, TOKEN.decimals)) : null;

  const isOwner =
    Boolean(address) && Boolean(wallet) && address!.toLowerCase() === wallet;

  return (
    <div className="mx-auto max-w-xl py-14 pb-28 lg:pb-16">
      {isLoading ? (
        <div className="glass h-64 animate-pulse" />
      ) : !row ? (
        <div className="glass p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-[var(--color-white-soft)]">
            No profile found
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            @{name} hasn&apos;t been claimed yet.
          </p>
        </div>
      ) : (
        <div className="glass flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
                {row.username}
              </h1>
              <a
                href={`${CHAIN.explorer}/address/${row.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-mono text-sm text-[var(--color-amethyst)] transition hover:text-[var(--color-chrome)]"
              >
                {truncateAddress(row.wallet)}
              </a>
            </div>
            {isOwner && (
              <Link
                href="/profile"
                className="btn-ghost rounded-xl px-4 py-2 text-sm font-medium"
              >
                Edit profile
              </Link>
            )}
          </div>

          {row.bio && (
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">{row.bio}</p>
          )}

          <div className="flex items-center gap-3">
            {row.x_url && <SocialIcon href={row.x_url} label="X" icon="x" />}
            {row.telegram_url && (
              <SocialIcon href={row.telegram_url} label="Telegram" icon="telegram" />
            )}
            {row.website_url && (
              <SocialIcon href={row.website_url} label="Website" icon="globe" />
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {TOKEN.symbol} balance
            </span>
            <span className="ml-3 font-mono text-sm font-semibold text-[var(--color-white-soft)]">
              {balance != null ? compact(balance) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SocialIcon({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "x" | "telegram" | "globe";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-stroke)] text-[var(--color-chrome)] transition hover:border-[rgba(196,160,255,0.4)] hover:text-white"
    >
      {icon === "x" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
        </svg>
      )}
      {icon === "telegram" && (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.94 4.5 2.9 11.84c-1.3.52-1.29 1.25-.24 1.57l4.88 1.52 1.9 5.83c.24.64.12.9.79.9.51 0 .74-.24 1.02-.51l2.44-2.37 5.07 3.75c.93.51 1.6.25 1.84-.87l3.32-15.66c.34-1.35-.51-1.97-1.98-1.03Z" />
        </svg>
      )}
      {icon === "globe" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9Z" />
        </svg>
      )}
    </a>
  );
}
