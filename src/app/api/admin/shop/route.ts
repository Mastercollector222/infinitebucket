import { NextResponse } from "next/server";
import { serviceSupabase, verifyAdmin } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

// POST /api/admin/shop
//   { wallet, iso, signature, action, ...payload }
// The signature is a loginMessage proof; the recovered signer must be in
// NEXT_PUBLIC_ADMIN_WALLETS. Writes happen with the service-role key.
export async function POST(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Shop storage is not configured.");

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
    case "set_min_tokens": {
      const v = num(body.value);
      if (v == null || v < 0) return fail(400, "Bad min_tokens value.");
      const { error } = await sb
        .from("shop_settings")
        .upsert({ key: "shop_min_tokens", value: String(Math.floor(v)) });
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "upsert_tier": {
      const min_tokens = num(body.min_tokens);
      const percent = num(body.percent);
      if (min_tokens == null || min_tokens < 0) return fail(400, "Bad min_tokens.");
      if (percent == null || percent < 0 || percent > 100) {
        return fail(400, "Percent must be 0–100.");
      }
      const row: Record<string, unknown> = {
        min_tokens,
        percent: Math.round(percent),
        label: str(body.label, 60),
        sort: Math.round(num(body.sort) ?? 0),
      };
      const id = num(body.id);
      if (id != null) row.id = id;
      const { error } = await sb.from("shop_tiers").upsert(row);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "delete_tier": {
      const id = num(body.id);
      if (id == null) return fail(400, "Missing tier id.");
      const { error } = await sb.from("shop_tiers").delete().eq("id", id);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "upsert_product": {
      const title = str(body.title, 120);
      const price_usdg = num(body.price_usdg);
      const stock = num(body.stock);
      if (!title) return fail(400, "Title is required.");
      if (price_usdg == null || price_usdg < 0) return fail(400, "Bad price.");
      if (stock == null || stock < 0) return fail(400, "Bad stock.");
      const image_url = str(body.image_url, 500);
      const row: Record<string, unknown> = {
        title,
        blurb: str(body.blurb, 500),
        image_url: image_url || null,
        price_usdg,
        stock: Math.round(stock),
        active: Boolean(body.active),
        sort: Math.round(num(body.sort) ?? 0),
      };
      const id = num(body.id);
      if (id != null) row.id = id;
      const { error } = await sb.from("shop_products").upsert(row);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "delete_product": {
      const id = num(body.id);
      if (id == null) return fail(400, "Missing product id.");
      const { error } = await sb.from("shop_products").delete().eq("id", id);
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "list_orders": {
      const status = str(body.status, 30);
      let q = sb
        .from("shop_orders")
        .select("*, shop_products(title)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true, orders: data ?? [] });
    }

    case "mark_shipped": {
      const id = num(body.id);
      if (id == null) return fail(400, "Missing order id.");
      const { error } = await sb
        .from("shop_orders")
        .update({
          status: "shipped",
          tracking_note: str(body.tracking_note, 300) || null,
          shipped_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "paid_pending_ship");
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    case "cancel_order": {
      const id = num(body.id);
      if (id == null) return fail(400, "Missing order id.");
      const { error } = await sb
        .from("shop_orders")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("status", "awaiting_tx");
      if (error) return fail(502, error.message);
      return NextResponse.json({ ok: true });
    }

    default:
      return fail(400, `Unknown action "${action}".`);
  }
}
