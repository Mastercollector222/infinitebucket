import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { BUCKET, CHAIN, ENGINE_DISTRIBUTOR, TOKEN } from "@/lib/constants";
import { IX } from "@/lib/engine";

export const revalidate = 900; // per-wallet sums cached 15 minutes

// In-memory per-wallet cache (warm serverless instances share it). Search
// params make this route dynamic, so this is the effective 15-min cache.
const TTL = 900_000;
const cache = new Map<string, { body: unknown; ts: number }>();

const BS_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  referer: `${CHAIN.explorer}/`,
} as const;

async function fetchJson(url: string, headers?: HeadersInit) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) return null;
  return (await res.json()) as Record<string, any>;
}

// Every launch token registered on Bucket Shop (the indexer paginates
// 40/page, 0-indexed). Used to detect whether a wallet holds other
// engine-paying tokens — in which case per-token attribution is impossible.
async function launchTokenSet(): Promise<Set<string>> {
  const set = new Set<string>();
  for (let page = 0; page <= 8; page++) {
    const j = await fetchJson(
      `${IX}/launches${page > 0 ? `?page=${page}` : ""}`,
    );
    const arr: Record<string, any>[] = Array.isArray(j)
      ? j
      : (j?.launches ?? j?.items ?? j?.data ?? []);
    for (const x of arr) {
      if (typeof x?.token === "string") set.add(x.token.toLowerCase());
    }
    const totalPages = typeof j?.pages === "number" ? j.pages : null;
    if (totalPages != null ? page + 1 >= totalPages : arr.length === 0) break;
  }
  return set;
}

export async function GET(req: NextRequest) {
  const wallet = (req.nextUrl.searchParams.get("wallet") ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return NextResponse.json(
      { ok: false, error: "bad wallet" },
      { status: 400 },
    );
  }

  const hit = cache.get(wallet);
  if (hit && Date.now() - hit.ts < TTL) {
    return NextResponse.json(hit.body);
  }

  try {
    // 1) BUCKET transfers to this wallet — paginate, then keep only the
    //    engine distributor as sender (excludes buys/transfers).
    const incoming: Record<string, any>[] = [];
    let next: Record<string, any> | null = null;
    for (let page = 0; page < 8; page++) {
      const url = new URL(
        `${CHAIN.explorer}/api/v2/addresses/${wallet}/token-transfers`,
      );
      url.searchParams.set("token", BUCKET.address.toLowerCase());
      if (next) {
        for (const [k, v] of Object.entries(next)) {
          url.searchParams.set(k, String(v));
        }
      }
      const j = await fetchJson(url.toString(), BS_HEADERS);
      if (!j) break;
      for (const t of j.items ?? []) {
        if (
          t?.to?.hash?.toLowerCase() === wallet &&
          t?.from?.hash?.toLowerCase() === ENGINE_DISTRIBUTOR
        ) {
          incoming.push(t);
        }
      }
      next = j.next_page_params ?? null;
      if (!next) break;
    }

    let raw = 0n;
    let lastTs: number | null = null;
    let lastTx: string | null = null;
    for (const t of incoming) {
      try {
        raw += BigInt(String(t?.total?.value ?? "0"));
      } catch {
        /* skip malformed value */
      }
      const ts = Date.parse(t?.timestamp ?? "");
      if (!Number.isNaN(ts) && (lastTs == null || ts > lastTs)) {
        lastTs = ts;
        lastTx = t?.transaction_hash ?? null;
      }
    }

    // 2) Attribution gate: if the wallet currently holds other Bucket Shop
    //    launch tokens, the shared-keeper payouts can't be split per token —
    //    report unattributable rather than a wrong total.
    const [launchTokens, balances] = await Promise.all([
      launchTokenSet(),
      fetchJson(
        `${CHAIN.explorer}/api/v2/addresses/${wallet}/token-balances`,
        BS_HEADERS,
      ),
    ]);
    const otherHeld: string[] = [];
    if (Array.isArray(balances)) {
      for (const b of balances) {
        const addr = String(b?.token?.address ?? "").toLowerCase();
        let held = false;
        try {
          held = BigInt(String(b?.value ?? "0")) > 0n;
        } catch {
          /* skip malformed balance */
        }
        if (
          addr &&
          addr !== TOKEN.address.toLowerCase() &&
          launchTokens.has(addr) &&
          held
        ) {
          otherHeld.push(addr);
        }
      }
    }
    const attributable = otherHeld.length === 0;

    const body = {
      ok: true,
      wallet,
      bucket: Number(formatUnits(raw, BUCKET.decimals)),
      bucketRaw: raw.toString(),
      payouts: incoming.length,
      lastPayoutTs: lastTs,
      lastTx,
      attributable,
      updatedAt: Date.now(),
    };
    cache.set(wallet, { body, ts: Date.now() });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
