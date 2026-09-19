import { NextResponse } from "next/server";
import { computeGiveaway, type GiveawayBody } from "@/lib/giveaway";

// Server-side path for /reward-the-holders. If a datacenter IP can't reach
// the indexer, the page falls back to computeGiveaway() in the browser —
// same code, CORS-open sources.
export const dynamic = "force-dynamic";

// before-cutoff responses refresh every 60s; post-cutoff result is
// deterministic (snapshot block + winner can't change), cached 6h.
const cache = new Map<string, { body: GiveawayBody; ts: number }>();

export async function GET() {
  const now = Date.now();
  const hit = cache.get("g");
  if (hit) {
    const ttl = hit.body.phase === "before" ? 60_000 : 6 * 3_600_000;
    const expected = now >= hit.body.cutoffTs * 1000 ? "after" : "before";
    if (Date.now() - hit.ts < ttl && hit.body.phase === expected) {
      return NextResponse.json(hit.body);
    }
  }

  try {
    const body = await computeGiveaway({
      payoutTx: process.env.GIVEAWAY_PAYOUT_TX || null,
    });
    cache.set("g", { body, ts: now });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
