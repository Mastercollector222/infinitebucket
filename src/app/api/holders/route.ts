import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { supabase } from "@/lib/supabase";
import { CHAIN, TOKEN } from "@/lib/constants";

export const revalidate = 300; // cache the Blockscout pull for 5 minutes

// Blockscout sits behind Cloudflare — a realistic browser fingerprint
// (UA + Accept-Language + same-origin Referer) is required or it returns 403.
const BS_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  referer: `${CHAIN.explorer}/`,
} as const;

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const LP_CONTRACT = "0x7c268926fba61e88966956ba34a36f98d13e6006";

type HolderRow = {
  rank: number;
  address: string;
  amount: number | null;
  label: string | null;
  username: string | null;
  avatar_url: string | null;
};

export async function GET() {
  try {
    // Pull pages until we have enough raw holders for a top-50 list after
    // exclusions (zero address is hidden, so grab a couple extra).
    const items: Record<string, unknown>[] = [];
    let nextParams: Record<string, unknown> | null = null;
    for (let page = 0; page < 3 && items.length < 55; page++) {
      const url = new URL(
        `${CHAIN.explorer}/api/v2/tokens/${TOKEN.address}/holders`,
      );
      if (nextParams) {
        for (const [k, v] of Object.entries(nextParams)) {
          url.searchParams.set(k, String(v));
        }
      }
      const res = await fetch(url, { headers: BS_HEADERS });
      if (!res.ok) break;
      const j = (await res.json()) as {
        items?: Record<string, unknown>[];
        next_page_params?: Record<string, unknown> | null;
      };
      items.push(...(j.items ?? []));
      nextParams = j.next_page_params ?? null;
      if (!nextParams) break;
    }

    // Normalize: lowercase addresses, drop the zero address, dedupe, cap at 50.
    const seen = new Set<string>();
    const rows: { address: string; amount: number | null }[] = [];
    for (const it of items) {
      const addr = String(
        (it?.address as { hash?: string } | undefined)?.hash ?? "",
      ).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr) || addr === ZERO || seen.has(addr)) {
        continue;
      }
      seen.add(addr);
      let amount: number | null = null;
      try {
        amount = Number(
          formatUnits(BigInt(String(it?.value ?? "0")), TOKEN.decimals),
        );
      } catch {
        amount = null;
      }
      rows.push({ address: addr, amount });
      if (rows.length >= 50) break;
    }

    // Left join public.users on lowercase wallet — read-only, anon key only.
    const profiles = new Map<
      string,
      { username: string | null; avatar_url: string | null }
    >();
    if (supabase && rows.length > 0) {
      const { data } = await supabase
        .from("users")
        .select("wallet, username, avatar_url")
        .in(
          "wallet",
          rows.map((r) => r.address),
        );
      for (const u of data ?? []) {
        profiles.set(u.wallet as string, {
          username: (u.username as string | null) ?? null,
          avatar_url: (u.avatar_url as string | null) ?? null,
        });
      }
    }

    const holders: HolderRow[] = rows.map((r, i) => {
      const u = profiles.get(r.address);
      let label: string | null = null;
      if (r.address === POOL_MANAGER) label = "Uniswap v4 Pool";
      else if (r.address === DEAD) label = "Burn";
      else if (r.address === LP_CONTRACT && !u) label = "Contract / LP";
      return {
        rank: i + 1,
        address: r.address,
        amount: r.amount,
        label,
        username: u?.username ?? null,
        avatar_url: u?.avatar_url ?? null,
      };
    });

    return NextResponse.json({ holders, updatedAt: Date.now(), ok: true });
  } catch (e) {
    return NextResponse.json(
      { holders: [], updatedAt: Date.now(), ok: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
