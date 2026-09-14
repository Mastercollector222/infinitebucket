import { NextResponse } from "next/server";
import { POOL, TOKEN } from "@/lib/constants";
import type { MarketData, MarketResponse, Trade } from "@/lib/types";

export const revalidate = 10;

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { accept: "application/json;version=20230302" };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

async function fromGeckoTerminal(): Promise<{ data: MarketData; trades: Trade[] } | null> {
  const url = `${GT_BASE}/networks/${POOL.network}/pools/${POOL.id}`;
  const res = await fetch(url, { headers: GT_HEADERS, next: { revalidate: 10 } });
  if (!res.ok) return null;
  const json = await res.json();
  const a = json?.data?.attributes;
  if (!a) return null;

  const txns = a.transactions?.h24;
  const txns24h =
    txns && typeof txns === "object"
      ? (num(txns.buys) ?? 0) + (num(txns.sells) ?? 0)
      : num(txns);

  const data: MarketData = {
    priceUsd: num(a.base_token_price_usd),
    change24h: num(a.price_change_percentage?.h24),
    volume24h: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    fdv: num(a.fdv_usd),
    txns24h,
    name: a.name ?? null,
    source: "geckoterminal",
    updatedAt: Date.now(),
  };

  const trades = await fromGeckoTerminalTrades();
  return { data, trades };
}

async function fromGeckoTerminalTrades(): Promise<Trade[]> {
  try {
    const url = `${GT_BASE}/networks/${POOL.network}/pools/${POOL.id}/trades`;
    const res = await fetch(url, { headers: GT_HEADERS, next: { revalidate: 10 } });
    if (!res.ok) return [];
    const json = await res.json();
    const rows: unknown[] = json?.data ?? [];
    return rows
      .map((row): Trade | null => {
        const r = row as { id?: string; attributes?: Record<string, unknown> };
        const at = r.attributes;
        if (!at) return null;
        const kind = String(at.kind ?? "");
        const side: "buy" | "sell" = kind === "sell" ? "sell" : "buy";
        const tsRaw = at.block_timestamp as string | undefined;
        const ts = tsRaw ? new Date(tsRaw).getTime() : Date.now();
        return {
          id: String(r.id ?? `${ts}-${Math.random()}`),
          side,
          priceUsd: num(at.price_to_in_usd) ?? num(at.price_from_in_usd),
          amountUsd: num(at.volume_in_usd),
          timestamp: ts,
          txUrl: undefined,
        };
      })
      .filter((t): t is Trade => t !== null)
      .slice(0, 12);
  } catch {
    return [];
  }
}

const BLOCKED_CHAINS = ["solana", "bsc", "base", "ethereum", "polygon", "arbitrum"];

async function fromDexscreener(): Promise<{ data: MarketData; trades: Trade[] } | null> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN.address}`;
  const res = await fetch(url, { next: { revalidate: 10 } });
  if (!res.ok) return null;
  const json = await res.json();
  const pairs: Array<Record<string, unknown>> = json?.pairs ?? [];
  // Robinhood Chain only. Reject known wrong chains, prefer USDG quote.
  const pair =
    pairs.find((p) => {
      const cid = String(p.chainId ?? "").toLowerCase();
      const quote = String((p.quoteToken as { symbol?: string })?.symbol ?? "").toUpperCase();
      return cid.includes("robinhood") || (!BLOCKED_CHAINS.includes(cid) && quote === "USDG");
    }) ?? null;
  if (!pair) return null;

  const data: MarketData = {
    priceUsd: num(pair.priceUsd),
    change24h: num((pair.priceChange as { h24?: unknown })?.h24),
    volume24h: num((pair.volume as { h24?: unknown })?.h24),
    liquidityUsd: num((pair.liquidity as { usd?: unknown })?.usd),
    fdv: num(pair.fdv),
    txns24h: (() => {
      const t = (pair.txns as { h24?: { buys?: number; sells?: number } })?.h24;
      if (!t) return null;
      return (num(t.buys) ?? 0) + (num(t.sells) ?? 0);
    })(),
    name: (pair.baseToken as { name?: string })?.name ?? null,
    source: "dexscreener",
    updatedAt: Date.now(),
  };
  return { data, trades: [] };
}

export async function GET() {
  let result: { data: MarketData; trades: Trade[] } | null = null;
  let error: string | undefined;

  try {
    result = await fromGeckoTerminal();
  } catch (e) {
    error = `geckoterminal: ${(e as Error).message}`;
  }

  if (!result || result.data.priceUsd == null) {
    try {
      const fallback = await fromDexscreener();
      if (fallback) result = fallback;
    } catch (e) {
      error = `${error ? error + "; " : ""}dexscreener: ${(e as Error).message}`;
    }
  }

  if (!result) {
    const body: MarketResponse = {
      ok: false,
      error: error ?? "no market source available",
      data: {
        priceUsd: null,
        change24h: null,
        volume24h: null,
        liquidityUsd: null,
        fdv: null,
        txns24h: null,
        name: null,
        source: null,
        updatedAt: Date.now(),
      },
      trades: [],
    };
    return NextResponse.json(body, { status: 200 });
  }

  const body: MarketResponse = { ok: true, ...result };
  return NextResponse.json(body, { status: 200 });
}
