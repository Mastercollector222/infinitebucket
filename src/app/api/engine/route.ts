import { NextResponse } from "next/server";
import { TOKEN, QUOTE } from "@/lib/constants";
import type { EngineStats } from "@/lib/types";

export const revalidate = 20;

// Bucket Shop launchpad indexer — the same source the official launch page
// reads. Proxied server-side to avoid CORS.
const IX = "https://launch.bucketmarkets.com/ix/launchpad";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
} as const;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function fail(error: string): EngineStats {
  return {
    burnedInfinity: null,
    burnedAtGraduation: null,
    burnedTotal: null,
    supplyNow: null,
    paidToHoldersTokenUsd: null,
    infinityToHolders: null,
    paidToHoldersUsd: null,
    engineUsd: null,
    jarUsd: null,
    lastPaydayTs: null,
    status: null,
    stalled: false,
    source: null,
    updatedAt: Date.now(),
    ok: false,
    error,
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 20 } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Find our token's launch record (paginated list).
async function findLaunch(addr: string): Promise<Record<string, any> | null> {
  for (let page = 1; page <= 5; page++) {
    const j = await fetchJson(`${IX}/launches${page > 1 ? `?page=${page}` : ""}`);
    const arr: Record<string, any>[] = Array.isArray(j)
      ? j
      : j.items ?? j.launches ?? j.data ?? Object.values(j);
    const rec = arr.find(
      (x) => typeof x.token === "string" && x.token.toLowerCase() === addr,
    );
    if (rec) return rec;
    if (!Array.isArray(arr) || arr.length === 0) break;
  }
  return null;
}

export async function GET() {
  const addr = TOKEN.address.toLowerCase();
  try {
    const [payouts, launch] = await Promise.all([
      fetchJson(`${IX}/payouts`).catch(() => null),
      findLaunch(addr).catch(() => null),
    ]);

    if (!payouts) return NextResponse.json(fail("payouts unavailable"), { status: 200 });

    const life = payouts.life ?? {};
    const tok = payouts.tokens?.[addr] ?? {};

    // Engine buy-back-and-burn: payouts indexer reports raw base units (18 dec).
    const engineBurned = (() => {
      const v = num(life.burned?.[addr]);
      return v != null ? v / 1e18 : null;
    })();

    // Current supply from the launch record (matches on-chain totalSupply).
    const supplyNow = (() => {
      const v = num(launch?.totalSupply);
      return v != null ? v / 1e18 : null;
    })();

    const burnedTotal =
      supplyNow != null ? TOKEN.totalSupply - supplyNow : null;
    const burnedAtGraduation =
      burnedTotal != null && engineBurned != null ? burnedTotal - engineBurned : null;

    // Per-token fees routed to the holder leg, from the launches income record.
    // USDG legs are 6-decimals; INFINITY leg is 18.
    const income = launch?.income;
    const poolFees = income?.pool ?? {};
    const usdgToHolders =
      (num(income?.curve?.toHolders) ?? 0) +
      (num(poolFees?.[QUOTE.address.toLowerCase()]?.toHolders) ?? 0);
    const infinityToHoldersRaw = num(
      poolFees?.[addr]?.toHolders,
    );

    const body: EngineStats = {
      burnedInfinity: engineBurned,
      burnedAtGraduation,
      burnedTotal,
      supplyNow,
      paidToHoldersTokenUsd: usdgToHolders > 0 ? usdgToHolders / 1e6 : null,
      infinityToHolders:
        infinityToHoldersRaw != null ? infinityToHoldersRaw / 1e18 : null,
      paidToHoldersUsd: num(life.paid_usd),
      engineUsd: num(life.engine_usd),
      jarUsd: num(tok.jar_usd),
      lastPaydayTs: num(tok.last_payday_ts),
      status: typeof payouts.status === "string" ? payouts.status : null,
      stalled: Boolean(payouts.stalled),
      source: "bucketshop",
      updatedAt: Date.now(),
      ok: true,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    return NextResponse.json(fail((e as Error).message), { status: 200 });
  }
}
