import { NextResponse } from "next/server";
import { CHAIN, TOKEN } from "@/lib/constants";
import type { TokenStats } from "@/lib/types";

export const revalidate = 30;

// Blockscout sits behind Cloudflare — a realistic browser fingerprint
// (UA + Accept-Language + same-origin Referer) is required or it returns 403.
const BS_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  referer: `${CHAIN.explorer}/`,
} as const;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: BS_HEADERS, next: { revalidate: 30 } });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function GET() {
  const base = `${CHAIN.explorer}/api/v2/tokens/${TOKEN.address}`;
  try {
    const [token, counters] = await Promise.all([
      fetchJson(base),
      fetchJson(`${base}/counters`).catch(() => null),
    ]);

    if (!token) {
      const body: TokenStats = {
        holders: null,
        totalSupply: null,
        transfers: null,
        source: null,
        updatedAt: Date.now(),
        ok: false,
        error: "blockscout unavailable",
      };
      return NextResponse.json(body, { status: 200 });
    }

    const body: TokenStats = {
      holders: num(token.holders_count ?? token.holders),
      totalSupply: (token.total_supply as string | undefined) ?? null,
      transfers: num(counters?.transfers_count ?? token.transfers_count),
      source: "blockscout",
      updatedAt: Date.now(),
      ok: true,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    const body: TokenStats = {
      holders: null,
      totalSupply: null,
      transfers: null,
      source: null,
      updatedAt: Date.now(),
      ok: false,
      error: (e as Error).message,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
