import { NextRequest, NextResponse } from "next/server";
import { playCap } from "@/lib/play";
import { loungeBalanceTokens } from "@/lib/loungeServer";
import { rateLimit, serviceSupabase, verifyWalletProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const ipKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

// GET /api/play/score
//   ?wallet=0x…          → public: { wins } only — a game stat, safe like the
//                          public leaderboard (used by /u/[username] "Drops").
//   proof headers        → own row: wins, games_played, remaining, cap.
// Headers: x-wallet / x-iso / x-signature (login-proof; body signed, so the
// signature stays out of the URL/logs).
export async function GET(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "storage not configured");
  if (!rateLimit(`play:score:${ipKey(req)}`, 120)) return fail(429, "rate limited");

  const publicWallet = req.nextUrl.searchParams.get("wallet");
  if (publicWallet && /^0x[0-9a-fA-F]{40}$/.test(publicWallet)) {
    const { data } = await sb
      .from("drop_scores")
      .select("wins")
      .eq("wallet", publicWallet.toLowerCase())
      .maybeSingle();
    return NextResponse.json({ ok: true, wins: (data?.wins as number | undefined) ?? 0 });
  }

  const wallet = req.headers.get("x-wallet");
  const iso = req.headers.get("x-iso");
  const signature = req.headers.get("x-signature");
  if (!wallet || !iso || !signature) return fail(401, "signature required");
  const signer = await verifyWalletProof(wallet, iso, signature);
  if (!signer) return fail(401, "bad signature");

  const [balance, { data: row }] = await Promise.all([
    loungeBalanceTokens(signer).catch(() => -1),
    sb
      .from("drop_scores")
      .select("wins, games_played, plays_today, plays_day")
      .eq("wallet", signer)
      .maybeSingle(),
  ]);
  if (balance <= 0) {
    return NextResponse.json({
      ok: true, demo: true, wins: 0, games_played: 0, remaining: null, cap: 0,
    });
  }
  const cap = playCap(balance);
  const today = new Date().toISOString().slice(0, 10); // UTC date
  const playsToday = row && row.plays_day === today ? (row.plays_today as number) : 0;
  return NextResponse.json({
    ok: true,
    demo: false,
    wins: (row?.wins as number | undefined) ?? 0,
    games_played: (row?.games_played as number | undefined) ?? 0,
    remaining: Math.max(0, cap - playsToday),
    cap,
  });
}
