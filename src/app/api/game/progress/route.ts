import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { rateLimit, serviceSupabase, verifyProgressProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

// Games that can write through this route — the page key, not whatever the
// game's postMessage calls itself.
const GAMES = new Set(["match"]);
const MAX_LEVEL = 100_000;

type ProgressRow = { wallet: string; max_level: number };

// GET /api/game/progress?game=match[&wallet=0x…]
// Top 20 board + the caller's own best. Public read.
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

  return NextResponse.json({
    ok: true,
    game,
    mine,
    items: items.map((r) => {
      const u = byWallet.get(r.wallet);
      return {
        wallet: r.wallet,
        max_level: r.max_level,
        username: u?.username ?? null,
        avatar_url: u?.avatar_url ?? null,
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
