import { NextResponse } from "next/server";
import { serviceSupabase, verifyAdmin } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// DELETE /api/admin/lounge/:id — body { wallet, iso, signature }.
// Admin signature (loginMessage proof + NEXT_PUBLIC_ADMIN_WALLETS) verified
// before the service-role delete.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Bad message id.");

  const sb = serviceSupabase();
  if (!sb) return fail(503, "Lounge storage is not configured.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Expected JSON body.");
  }
  const { wallet, iso, signature } = body as {
    wallet?: string;
    iso?: string;
    signature?: string;
  };
  if (!wallet || !iso || !signature) return fail(400, "Missing wallet proof.");

  const admin = await verifyAdmin(wallet, iso, signature);
  if (!admin) return fail(403, "Not an admin wallet (or stale signature).");

  const { error } = await sb.from("lounge_messages").delete().eq("id", id);
  if (error) return fail(502, error.message);
  return NextResponse.json({ ok: true });
}
