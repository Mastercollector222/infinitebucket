import { NextResponse } from "next/server";
import { TOKEN } from "@/lib/constants";
import type { EngineStats } from "@/lib/types";

export const revalidate = 20;

// Bucket Shop launchpad indexer — powers the live engine numbers on the
// official launch page. Proxied server-side to avoid CORS.
const PAYOUTS = "https://launch.bucketmarkets.com/ix/launchpad/payouts";

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

export async function GET() {
  try {
    const res = await fetch(PAYOUTS, { headers: HEADERS, next: { revalidate: 20 } });
    if (!res.ok) return NextResponse.json(fail(`payouts ${res.status}`), { status: 200 });

    const j = (await res.json()) as {
      life?: { paid_usd?: unknown; engine_usd?: unknown; burned?: Record<string, unknown> };
      tokens?: Record<string, { jar_usd?: unknown; last_payday_ts?: unknown }>;
      status?: unknown;
      stalled?: unknown;
    };

    const addr = TOKEN.address.toLowerCase();
    const life = j.life ?? {};
    const tok = j.tokens?.[addr] ?? {};

    const burnedRaw = num(life.burned?.[addr]);
    const body: EngineStats = {
      // burned is reported in token base units (18 decimals).
      burnedInfinity: burnedRaw != null ? burnedRaw / 1e18 : null,
      paidToHoldersUsd: num(life.paid_usd),
      engineUsd: num(life.engine_usd),
      jarUsd: num(tok.jar_usd),
      lastPaydayTs: num(tok.last_payday_ts),
      status: typeof j.status === "string" ? j.status : null,
      stalled: Boolean(j.stalled),
      source: "bucketshop",
      updatedAt: Date.now(),
      ok: true,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    return NextResponse.json(fail((e as Error).message), { status: 200 });
  }
}
