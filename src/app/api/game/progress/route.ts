import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { loungeBalanceTokens } from "@/lib/loungeServer";
import { rateLimit, serviceSupabase, verifyProgressProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

// Games that can write through this route — the page key, not whatever the
// game's postMessage calls itself.
const GAMES = new Set(["match"]);
const MAX_LEVEL = 100_000;
// Cash-reward gate: playing is free for anyone; rewards require this much
// INFINITY held in the wallet at check time.
const REWARD_GATE = 5_000_000;

type ProgressRow = { wallet: string; max_level: number };
type GameEvent = {
  id: string;
  game: string;
  kind: string;
  ends_at: string;
  prize_usdg: number;
  winner_wallet: string | null;
  prize_level: number | null;
  payout_tx: string | null;
  closed: boolean;
};

// Latest event for a game, closing it if the deadline passed — winner is
// the first >=5M-INFINITY wallet on the board (max_level desc, earliest
// updated_at tiebreak), frozen atomically so post-close bumps can't steal
// the race. Called before any write for the same reason.
async function maybeCloseEvent(
  sb: NonNullable<ReturnType<typeof serviceSupabase>>,
  game: string,
): Promise<GameEvent | null> {
  const { data: ev } = await sb
    .from("game_events")
    .select("*")
    .eq("game", game)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const event = ev as GameEvent | null;
  if (!event || event.closed || Date.parse(event.ends_at) > Date.now()) {
    return event;
  }
  const { data: cands } = await sb
    .from("game_progress")
    .select("wallet, max_level")
    .eq("game", game)
    .order("max_level", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(50);
  let winner: string | null = null;
  let level: number | null = null;
  for (const c of (cands ?? []) as ProgressRow[]) {
    const bal = await loungeBalanceTokens(c.wallet).catch(() => 0);
    if (bal >= REWARD_GATE) {
      winner = c.wallet;
      level = c.max_level;
      break;
    }
  }
  const { data: closedRow } = await sb.rpc("game_event_close", {
    p_id: event.id,
    p_winner: winner,
    p_level: level,
  });
  if (closedRow) return closedRow as GameEvent;
  // Lost a close race or the table is missing — re-read whatever stands.
  const { data: again } = await sb
    .from("game_events")
    .select("*")
    .eq("id", event.id)
    .maybeSingle();
  return (again as GameEvent | null) ?? { ...event, closed: true, winner_wallet: winner, prize_level: level };
}

// GET /api/game/progress?game=match[&wallet=0x…]
// Top 20 board + the caller's own best + the current event. Public read.
export async function GET(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "storage not configured" }, { status: 503 });
  if (!rateLimit(`progress:board:${ipKey(req)}`, 120)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const game = req.nextUrl.searchParams.get("game") ?? "";
  if (!GAMES.has(game)) {
    return NextResponse.json({ ok: false, error: "unknown game" }, { status: 400 });
  }

  const event = await maybeCloseEvent(sb, game).catch(() => null);

  const { data: rows } = await sb
    .from("game_progress")
    .select("wallet, max_level")
    .eq("game", game)
    .order("max_level", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(20);
  const items = (rows ?? []) as ProgressRow[];

  const { data: users } = items.length
    ? await sb
        .from("users")
        .select("wallet, username, avatar_url")
        .in("wallet", items.map((r) => r.wallet))
    : { data: [] as { wallet: string; username: string | null; avatar_url: string | null }[] };
  const byWallet = new Map((users ?? []).map((u) => [u.wallet, u]));

  // Reward eligibility from live balanceOf (30s cache) — a flag on the row,
  // never a gate on playing or appearing on the board.
  const balances = await Promise.all(
    items.map((r) => loungeBalanceTokens(r.wallet).catch(() => 0)),
  );

  let mine: number | null = null;
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (wallet) {
    try {
      const w = getAddress(wallet).toLowerCase();
      const { data: own } = await sb
        .from("game_progress")
        .select("max_level")
        .eq("game", game)
        .eq("wallet", w)
        .maybeSingle();
      mine = own?.max_level ?? null;
    } catch {
      /* malformed wallet — treated as absent */
    }
  }

  // Enrich the frozen winner for display (username/avatar if claimed).
  let winner = null;
  if (event?.winner_wallet) {
    const inBoard = items.find((r) => r.wallet === event.winner_wallet);
    let u = inBoard ? byWallet.get(inBoard.wallet) : undefined;
    if (!u) {
      const { data: wu } = await sb
        .from("users")
        .select("wallet, username, avatar_url")
        .eq("wallet", event.winner_wallet)
        .maybeSingle();
      u = wu ?? undefined;
    }
    winner = {
      wallet: event.winner_wallet,
      username: u?.username ?? null,
      avatar_url: u?.avatar_url ?? null,
    };
  }

  return NextResponse.json({
    ok: true,
    game,
    mine,
    event: event
      ? {
          id: event.id,
          ends_at: event.ends_at,
          prize_usdg: Number(event.prize_usdg),
          closed: event.closed,
          winner,
          prize_level: event.prize_level,
          payout_tx: event.payout_tx,
        }
      : null,
    items: items.map((r, i) => {
      const u = byWallet.get(r.wallet);
      return {
        wallet: r.wallet,
        max_level: r.max_level,
        username: u?.username ?? null,
        avatar_url: u?.avatar_url ?? null,
        eligible: balances[i] >= REWARD_GATE,
      };
    }),
  });
}

// POST /api/game/progress — signed progress-session proof (progressMessage
// over game+iso, 30-min freshness). Only ever raises max_level.
export async function POST(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "storage not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const { wallet, game, iso, signature, level } = (body ?? {}) as {
    wallet?: string; game?: string; iso?: string; signature?: string; level?: unknown;
  };
  if (!wallet || !iso || !signature || typeof game !== "string" || !GAMES.has(game)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const lvl = typeof level === "number" ? level : NaN;
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > MAX_LEVEL) {
    return NextResponse.json({ ok: false, error: "bad level" }, { status: 400 });
  }

  const w = await verifyProgressProof(wallet, iso, signature, game);
  if (!w) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`progress:save:${w}`, 60)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  // Freeze the race before applying this bump — a save after the deadline
  // must not be able to change the winner.
  await maybeCloseEvent(sb, game).catch(() => null);

  const { data, error } = await sb.rpc("game_progress_bump", {
    p_wallet: w,
    p_game: game,
    p_level: lvl,
  });
  if (error || typeof data !== "number") {
    return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, max_level: data });
}
