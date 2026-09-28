import { NextRequest, NextResponse } from "next/server";
import { rateLimit, serviceSupabase, verifyAdmin } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const WEEK_RE = /^\d{4}-\d{2}$/;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const wallet = req.headers.get("x-wallet");
  const iso = req.headers.get("x-iso");
  const signature = req.headers.get("x-signature");
  if (!wallet || !iso || !signature) return null;
  return verifyAdmin(wallet, iso, signature);
}

// GET /api/admin/drop-week — every week that has meta or scores, with its
// top wallet. Admin-proof headers required.
export async function GET(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "storage not configured");
  if (!rateLimit(`admin:dropweek:${ipKey(req)}`, 60)) return fail(429, "rate limited");
  const admin = await requireAdmin(req);
  if (!admin) return fail(401, "admin signature required");

  const { data: metaRows } = await sb
    .from("drop_week_meta")
    .select("week_id, prize_usdg, payout_tx, closed")
    .order("week_id", { ascending: false });
  const { data: scoreWeeks } = await sb
    .from("drop_week_scores")
    .select("week_id")
    .order("week_id", { ascending: false })
    .limit(1000);

  const weekIds = [...new Set([
    ...(metaRows ?? []).map((m) => m.week_id as string),
    ...(scoreWeeks ?? []).map((s) => s.week_id as string),
  ])].sort().reverse();

  const weeks = await Promise.all(
    weekIds.slice(0, 30).map(async (week_id) => {
      const { data: top } = await sb
        .from("drop_week_scores")
        .select("wallet, wins")
        .eq("week_id", week_id)
        .order("wins", { ascending: false })
        .order("games", { ascending: true })
        .limit(1);
      const meta = (metaRows ?? []).find((m) => m.week_id === week_id);
      return {
        week_id,
        prize_usdg: Number(meta?.prize_usdg ?? 10),
        payout_tx: meta?.payout_tx ?? null,
        closed: Boolean(meta?.closed),
        leader: top?.[0] ? { wallet: top[0].wallet, wins: top[0].wins } : null,
      };
    }),
  );
  const { data: currentWeek } = await sb.rpc("drop_week_id");
  return NextResponse.json({ ok: true, current_week: currentWeek, weeks });
}

// POST /api/admin/drop-week — { action: set_prize | set_payout | set_closed }
// week_id defaults to the current week. Admin login proof in headers.
export async function POST(req: NextRequest) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "storage not configured");
  const body = await req.json().catch(() => null);
  const { wallet, iso, signature, action } = body ?? {};
  if (typeof wallet !== "string" || typeof iso !== "string" || typeof signature !== "string") {
    return fail(400, "bad request");
  }
  const admin = await verifyAdmin(wallet, iso, signature);
  if (!admin) return fail(401, "admin signature required");
  if (!rateLimit(`admin:dropweek:${admin}`, 30)) return fail(429, "rate limited");

  const { data: currentWeek } = await sb.rpc("drop_week_id");
  const weekId = typeof body.week_id === "string" && WEEK_RE.test(body.week_id)
    ? body.week_id
    : (currentWeek as string);

  const patch: Record<string, unknown> = { week_id: weekId };
  if (action === "set_prize") {
    const p = Number(body.prize_usdg);
    if (!Number.isFinite(p) || p < 0 || p > 10_000) return fail(400, "bad prize");
    patch.prize_usdg = p;
  } else if (action === "set_payout") {
    const tx = typeof body.payout_tx === "string" ? body.payout_tx.trim() : "";
    if (!TX_RE.test(tx)) return fail(400, "payout_tx must be a 0x tx hash");
    patch.payout_tx = tx.toLowerCase();
  } else if (action === "set_closed") {
    patch.closed = Boolean(body.closed);
  } else {
    return fail(400, "unknown action");
  }

  const { error } = await sb
    .from("drop_week_meta")
    .upsert(patch, { onConflict: "week_id" });
  if (error) return fail(500, "could not save week meta");
  return NextResponse.json({ ok: true, week_id: weekId });
}

const ipKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
