import { NextRequest, NextResponse } from "next/server";
import { playCap } from "@/lib/play";
import { loungeBalanceTokens } from "@/lib/loungeServer";
import { rateLimit, serviceSupabase, verifyPlayProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/play/start — one authorized match per call.
// Body: { wallet, iso, signature } — personal_sign over
// playMessage("play_start"). The daily cap is computed from a live on-chain
// balance read, never a posted value. Demo-mode wallets (balance 0) are
// allowed without touching drop_scores.
export async function POST(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "storage not configured");
  const body = await req.json().catch(() => null);
  const { wallet, iso, signature } = body ?? {};
  if (typeof wallet !== "string" || typeof iso !== "string" || typeof signature !== "string") {
    return fail(400, "bad request");
  }
  const signer = await verifyPlayProof(wallet, iso, signature, "play_start");
  if (!signer || signer !== wallet.toLowerCase()) return fail(401, "bad signature");
  if (!rateLimit(`play:start:${signer}`, 30)) {
    return fail(429, "rate limited — try later");
  }

  const balance = await loungeBalanceTokens(signer).catch(() => -1);
  if (balance < 0) return fail(502, "balance lookup failed");
  if (balance <= 0) {
    return NextResponse.json({ ok: true, allowed: true, demo: true, remaining: null, cap: 0 });
  }

  const cap = playCap(balance);
  const { data, error } = await sb.rpc("drop_start", {
    p_wallet: signer,
    p_cap: cap,
  });
  if (error) return fail(500, "could not start match");
  const r = data as { allowed: boolean; remaining: number; wins: number; games_played: number };
  return NextResponse.json({
    ok: true,
    allowed: Boolean(r?.allowed),
    demo: false,
    remaining: r?.remaining ?? 0,
    cap,
    wins: r?.wins ?? 0,
    games_played: r?.games_played ?? 0,
  });
}
