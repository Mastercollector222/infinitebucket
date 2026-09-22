import { NextResponse } from "next/server";
import {
  decField,
  encField,
  rateLimit,
  serviceSupabase,
  verifyActionProof,
} from "@/lib/shopServer";
import { SHIP_FIELDS, validateShipment, type ShipmentInput } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 200) : "";
}

// POST /api/shop/shipment
//   { action: "get", wallet, iso, signature, order_id }
//   { action: "set", wallet, iso, signature, order_id, recipient_name, ... }
// PII is action-bound: the signature must commit to this action + order id —
// a 24h login session alone never unlocks an address. The recovered signer
// must own the order. Fields are encrypted at rest when
// SHIPPING_ENCRYPTION_KEY is set; the row is never readable via anon/RLS.
export async function POST(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Shop storage is not configured.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Expected JSON body.");
  }

  const { action, wallet, iso, signature } = body as {
    action?: string;
    wallet?: string;
    iso?: string;
    signature?: string;
  };
  const order_id = Number(body.order_id);
  if (
    (action !== "get" && action !== "set") ||
    !wallet || !iso || !signature || !Number.isInteger(order_id)
  ) {
    return fail(400, "Missing action, wallet proof, or order id.");
  }
  const signer = await verifyActionProof(
    wallet, iso, signature, `shipment_${action}`, order_id,
  );
  if (!signer) return fail(401, "Invalid or stale wallet signature — sign in again.");

  const { data: order } = await sb
    .from("shop_orders")
    .select("id, wallet, status")
    .eq("id", order_id)
    .maybeSingle();
  if (!order) return fail(404, "Order not found.");
  if (order.wallet !== signer) return fail(403, "Not your order.");

  if (action === "get") {
    const { data: s } = await sb
      .from("shop_shipments")
      .select("*")
      .eq("order_id", order_id)
      .maybeSingle();
    if (!s) return NextResponse.json({ ok: true, shipment: null });
    const shipment: Record<string, string> = {};
    for (const f of SHIP_FIELDS) {
      shipment[f] = decField(String(s[f] ?? ""), Boolean(s.enc));
    }
    return NextResponse.json({ ok: true, shipment });
  }

  if (action === "set") {
    if (!rateLimit(`ship:${signer}`, 20)) {
      return fail(429, "Too many address updates — try again later.");
    }
    if (order.status === "shipped" || order.status === "cancelled") {
      return fail(400, "Shipping address is locked for this order.");
    }
    if (order.status !== "paid_need_address" && order.status !== "paid_pending_ship") {
      return fail(400, "Payment must be verified before adding an address.");
    }

    const input: ShipmentInput = {
      recipient_name: clean(body.recipient_name),
      line1: clean(body.line1),
      line2: clean(body.line2),
      city: clean(body.city),
      region: clean(body.region),
      postal: clean(body.postal),
      country: clean(body.country),
      phone: clean(body.phone),
    };
    const vErr = validateShipment(input);
    if (vErr) return fail(400, vErr);

    // Encrypt each field (no-op plaintext when no key is configured).
    let enc = false;
    const row: Record<string, unknown> = { order_id };
    for (const f of SHIP_FIELDS) {
      const r = encField(input[f]);
      row[f] = r.value;
      enc = enc || r.enc;
    }
    row.enc = enc;

    const { error } = await sb
      .from("shop_shipments")
      .upsert(row, { onConflict: "order_id" });
    if (error) return fail(502, `Could not save address: ${error.message}`);

    // First submission moves the order to paid_pending_ship.
    if (order.status === "paid_need_address") {
      await sb
        .from("shop_orders")
        .update({ status: "paid_pending_ship" })
        .eq("id", order_id)
        .eq("status", "paid_need_address");
    }
    return NextResponse.json({ ok: true, status: "paid_pending_ship" });
  }
}
