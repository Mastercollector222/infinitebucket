import { NextResponse } from "next/server";
import { BUCKET, BUCKET_POOL } from "@/lib/constants";
import type { BucketQuote } from "@/lib/types";

export const revalidate = 30;

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { accept: "application/json;version=20230302" };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

// Primary: GeckoTerminal on the deepest BUCKET/USDG pool.
async function fromGeckoTerminal(): Promise<BucketQuote | null> {
  const url = `${GT_BASE}/networks/${BUCKET_POOL.network}/pools/${BUCKET_POOL.id}`;
  const res = await fetch(url, { headers: GT_HEADERS, next: { revalidate: 30 } });
  if (!res.ok) return null;
  const json = await res.json();
  const a = json?.data?.attributes;
  if (!a) return null;
  return {
    ok: true,
    priceUsd: num(a.base_token_price_usd),
    change24h: num(a.price_change_percentage?.h24),
  };
}

const BLOCKED_CHAINS = ["solana", "bsc", "base", "ethereum", "polygon", "arbitrum"];

// Fallback: Dexscreener token lookup — deepest-liquidity Robinhood pair
// where BUCKET is the base token.
async function fromDexscreener(): Promise<BucketQuote | null> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${BUCKET.address}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) return null;
  const json = await res.json();
  const pairs: Array<Record<string, unknown>> = json?.pairs ?? [];
  const candidates = pairs.filter((p) => {
    const cid = String(p.chainId ?? "").toLowerCase();
    const base = String(
      (p.baseToken as { address?: string })?.address ?? "",
    ).toLowerCase();
    return (
      base === BUCKET.address.toLowerCase() &&
      (cid.includes("robinhood") || !BLOCKED_CHAINS.includes(cid))
    );
  });
  if (candidates.length === 0) return null;
  const pair = candidates.reduce((best, p) =>
    ((p.liquidity as { usd?: number })?.usd ?? 0) >
    ((best.liquidity as { usd?: number })?.usd ?? 0)
      ? p
      : best,
  );
  return {
    ok: true,
    priceUsd: num(pair.priceUsd),
    change24h: num((pair.priceChange as { h24?: unknown })?.h24),
  };
}

export async function GET() {
  let result: BucketQuote | null = null;
  let error: string | undefined;

  try {
    result = await fromGeckoTerminal();
  } catch (e) {
    error = `geckoterminal: ${(e as Error).message}`;
  }

  if (!result || result.priceUsd == null) {
    try {
      const fallback = await fromDexscreener();
      if (fallback?.priceUsd != null) result = fallback;
    } catch (e) {
      error = `${error ? error + "; " : ""}dexscreener: ${(e as Error).message}`;
    }
  }

  const body: BucketQuote = result?.priceUsd != null
    ? result
    : { ok: false, priceUsd: null, change24h: null, error: error ?? "no bucket source" };
  return NextResponse.json(body, { status: 200 });
}
