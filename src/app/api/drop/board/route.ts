import { NextRequest, NextResponse } from "next/server";
import { badgeFor } from "@/lib/lounge";
import { loungeBalanceTokens } from "@/lib/loungeServer";
import { rateLimit, serviceSupabase } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

type ScoreRow = { wallet: string; wins: number; games?: number };

// Enrich score rows with claimed profiles + live-balance badges. Badges are
// computed from on-chain balanceOf (30s cache), never stored.
async function enrich(sb: NonNullable<ReturnType<typeof serviceSupabase>>, rows: ScoreRow[]) {
  const wallets = rows.map((r) => r.wallet);
  const { data: users } = wallets.length
    ? await sb.from("users").select("wallet,username,avatar_url").in("wallet", wallets)
    : { data: [] as { wallet: string; username: string | null; avatar_url: string | null }[] };
  const byWallet = new Map((users ?? []).map((u) => [u.wallet, u]));
  const balances = await Promise.all(
    rows.map((r) => loungeBalanceTokens(r.wallet).catch(() => 0)),
  );
  return rows.map((r, i) => {
    const u = byWallet.get(r.wallet);
    const badge = badgeFor(balances[i]);
    return {
      wallet: r.wallet,
      wins: r.wins,
      games: r.games ?? null,
      username: u?.username ?? null,
      avatar_url: u?.avatar_url ?? null,
      badge: badge ? { name: badge.name, color: badge.color } : null,
    };
  });
}

// GET /api/drop/board?scope=week|all[&week=IYYY-IW]
// Public board — the tables themselves are service_role-only.
export async function GET(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "storage not configured" }, { status: 503 });
  if (!rateLimit(`drop:board:${ipKey(req)}`, 120)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const scope = req.nextUrl.searchParams.get("scope") ?? "week";

  if (scope === "all") {
    const { data: rows } = await sb
      .from("drop_scores")
      .select("wallet, wins, games_played")
      .order("wins", { ascending: false })
      .order("games_played", { ascending: true })
      .limit(50);
    const items = await enrich(sb, (rows ?? []).map((r) => ({ wallet: r.wallet, wins: r.wins })));
    return NextResponse.json({ ok: true, scope: "all", items });
  }

  // Weekly — resolve week_id (server-side ISO/UTC formula) and its meta.
  const { data: currentWeek } = await sb.rpc("drop_week_id");
  if (!currentWeek) {
    return NextResponse.json({
      ok: true, scope: "week", week_id: null, is_current: false, items: [],
      meta: { prize_usdg: 10, closed: false, payout_tx: null }, previous: null,
    });
  }
  const weekId = req.nextUrl.searchParams.get("week") ?? (currentWeek as string);
  const isCurrent = weekId === currentWeek;

  const [scoresRes, metaRes, lastClosedRes] = await Promise.all([
    sb
      .from("drop_week_scores")
      .select("wallet, wins, games")
      .eq("week_id", weekId)
      .order("wins", { ascending: false })
      .order("games", { ascending: true })
      .limit(50),
    sb
      .from("drop_week_meta")
      .select("week_id, prize_usdg, payout_tx, closed")
      .eq("week_id", weekId)
      .maybeSingle(),
    isCurrent
      ? sb
          .from("drop_week_meta")
          .select("week_id, prize_usdg, payout_tx, closed")
          .eq("closed", true)
          .order("week_id", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const items = await enrich(sb, (scoresRes.data ?? []) as ScoreRow[]);

  // Last closed week: its winner for the "previous result" strip.
  let previous: { week_id: string; winner: (typeof items)[number] | null; prize_usdg: number; payout_tx: string | null } | null = null;
  const lastClosed = lastClosedRes.data;
  if (lastClosed) {
    const { data: top } = await sb
      .from("drop_week_scores")
      .select("wallet, wins")
      .eq("week_id", lastClosed.week_id)
      .order("wins", { ascending: false })
      .order("games", { ascending: true })
      .limit(1);
    const winner = top?.[0] ? (await enrich(sb, [top[0] as ScoreRow]))[0] : null;
    previous = {
      week_id: lastClosed.week_id,
      winner,
      prize_usdg: Number(lastClosed.prize_usdg),
      payout_tx: lastClosed.payout_tx,
    };
  }

  return NextResponse.json({
    ok: true,
    scope: "week",
    week_id: weekId,
    is_current: isCurrent,
    items,
    meta: {
      prize_usdg: Number(metaRes.data?.prize_usdg ?? 10),
      closed: Boolean(metaRes.data?.closed),
      payout_tx: (metaRes.data?.payout_tx as string | null) ?? null,
    },
    previous,
  });
}
