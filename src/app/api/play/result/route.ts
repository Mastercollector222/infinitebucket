import { NextRequest, NextResponse } from "next/server";
import { rateLimit, serviceSupabase, verifyPlayProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/play/result — records a match outcome.
// Body: { wallet, iso, signature, outcome: "win" | "lose" } — personal_sign
// over playMessage("play_result"). Wins are only incremented when an
// authorized started match is still un-scored (games_played > wins), so a
// replayed signature cannot inflate the career score.
export async function POST(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "storage not configured");
  const body = await req.json().catch(() => null);
  const { wallet, iso, signature, outcome } = body ?? {};
  if (
    typeof wallet !== "string" || typeof iso !== "string" ||
    typeof signature !== "string" || (outcome !== "win" && outcome !== "lose")
  ) {
    return fail(400, "bad request");
  }
  const signer = await verifyPlayProof(wallet, iso, signature, "play_result");
  if (!signer || signer !== wallet.toLowerCase()) return fail(401, "bad signature");
  if (!rateLimit(`play:result:${signer}`, 30)) {
    return fail(429, "rate limited — try later");
  }

  if (outcome === "lose") {
    return NextResponse.json({ ok: true }); // games_played already counted at start
  }
  const { data, error } = await sb.rpc("drop_win", { p_wallet: signer });
  if (error) return fail(500, "could not record result");
  if (data == null) {
    return fail(409, "no started match to score");
  }
  return NextResponse.json({ ok: true, wins: data });
}
