import { NextResponse } from "next/server";
import { serviceSupabase, verifyAdmin } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/admin/lounge — { wallet, iso, signature, action, ... }
// Moderation actions behind the same signed-admin gate as the shop.
//   delete            { id }            → remove a message
//   mute / unmute     { target, hours } → lounge_mutes upsert/delete
export async function POST(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Lounge storage is not configured.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Expected JSON body.");
  }

  const { wallet, iso, signature, action } = body as {
    wallet?: string;
    iso?: string;
    signature?: string;
    action?: string;
  };
  if (!wallet || !iso || !signature || !action) {
    return fail(400, "Missing wallet proof or action.");
  }

  const admin = await verifyAdmin(wallet, iso, signature);
  if (!admin) return fail(403, "Not an admin wallet (or stale signature).");

  switch (action) {
    case "delete": {
      const id = String(body.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Bad message id.");
      const { error } = await sb.from("lounge_messages").delete().eq("id", id);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "mute": {
      const target = String(body.target ?? "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(target)) return fail(400, "Bad wallet.");
      const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 24 * 30);
      const until = new Date(Date.now() + hours * 3_600_000).toISOString();
      const { error } = await sb
        .from("lounge_mutes")
        .upsert({ wallet: target, until });
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true, until });
    }

    case "unmute": {
      const target = String(body.target ?? "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(target)) return fail(400, "Bad wallet.");
      const { error } = await sb
        .from("lounge_mutes")
        .delete()
        .eq("wallet", target);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    default:
      return fail(400, `Unknown action "${action}".`);
  }
}
