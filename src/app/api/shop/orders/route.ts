import { NextResponse } from "next/server";
import {
  rateLimit,
  readBalanceRaw,
  serviceSupabase,
  shippingUsdg,
  shopPriceUsdg,
  txReceiptTransfers,
  verifyActionProof,
  verifyWalletProof,
} from "@/lib/shopServer";
import { infinityDueRaw, tierFor, SHOP_WALLET } from "@/lib/shop";
import { TOKEN } from "@/lib/constants";
import type { ShopProduct, ShopTier } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const ITEMS_SELECT = "*, shop_order_items(*, shop_products(title))";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/shop/orders
//   { action: "mine",   wallet, iso, signature }                     — login proof
//   { action: "create", wallet, iso, signature, items: [...] }       — login proof
//   { action: "pay",    wallet, iso, signature, order_id, tx_hash }  — action proof
// The recovered signer is the only wallet the order can belong to. "pay"
// requires a signature over the action message (action + order_id bound) —
// the 24h login proof alone can never mark an order paid. Prices, discounts,
// stock, and the amount due are all recomputed server-side.
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
  if (!action || !wallet || !iso || !signature) {
    return fail(400, "Missing action or wallet proof.");
  }

  // "pay" is action-bound: the signed message must commit to this exact
  // action + order id. Everything else uses the 24h login proof.
  const payOrderId = Number(body.order_id);
  const signer =
    action === "pay"
      ? await verifyActionProof(wallet, iso, signature, "pay", payOrderId)
      : await verifyWalletProof(wallet, iso, signature);
  if (!signer) {
    return fail(401, "Invalid or stale wallet signature — sign in again.");
  }

  if (action === "mine") {
    const { data, error } = await sb
      .from("shop_orders")
      .select(ITEMS_SELECT)
      .eq("wallet", signer)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return fail(502, `Could not load orders: ${error.message}`);
    return NextResponse.json({ ok: true, orders: data ?? [] });
  }

  if (action === "create") {
    if (!SHOP_WALLET) return fail(503, "Shop wallet is not configured.");
    if (!rateLimit(`order:${signer}`, 10)) {
      return fail(429, "Too many orders — try again later.");
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0 || items.length > 20) {
      return fail(400, "Cart is empty.");
    }
    // Normalize + merge duplicate product lines.
    const lines = new Map<number, number>();
    for (const it of items) {
      const pid = Number((it as { product_id?: unknown }).product_id);
      const qty = Math.floor(Number((it as { qty?: unknown }).qty));
      if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return fail(400, "Bad cart line.");
      }
      lines.set(pid, (lines.get(pid) ?? 0) + qty);
    }

    const ids = [...lines.keys()];
    const { data: products, error: pErr } = await sb
      .from("shop_products")
      .select("*")
      .in("id", ids);
    if (pErr) return fail(502, `Could not load products: ${pErr.message}`);
    const byId = new Map<number, ShopProduct>(
      ((products ?? []) as ShopProduct[]).map((p) => [p.id, p]),
    );

    // Authoritative stock/active check — server is the source of truth.
    const unavailable: string[] = [];
    for (const [pid, qty] of lines) {
      const p = byId.get(pid);
      if (!p || !p.active) unavailable.push(p?.title ?? `#${pid}`);
      else if (p.stock < qty) unavailable.push(`${p.title} (only ${p.stock} left)`);
    }
    if (unavailable.length > 0) {
      return fail(400, `Unavailable: ${unavailable.join(", ")} — remove them and retry.`);
    }

    const [rawBal, tiersRes, priceUsdg] = await Promise.all([
      readBalanceRaw(signer).catch(() => null),
      sb.from("shop_tiers").select("*"),
      shopPriceUsdg(),
    ]);
    if (rawBal == null) return fail(502, "Could not read your balance on-chain.");
    if (priceUsdg == null) return fail(502, "No INFINITY quote available — try again.");

    // Per-item hold gate — re-checked on-chain, never from the client.
    const gated: string[] = [];
    for (const pid of lines.keys()) {
      const p = byId.get(pid);
      const min = BigInt(Math.max(0, Number(p?.min_infinity_tokens) || 0)) * 10n ** 18n;
      if (p && min > 0n && rawBal < min) {
        gated.push(`${p.title} (needs ${Number(p.min_infinity_tokens).toLocaleString()} INFINITY)`);
      }
    }
    if (gated.length > 0) {
      return fail(403, `Balance too low for: ${gated.join(", ")}.`);
    }

    const balance = Number(rawBal / 10n ** 18n); // whole tokens — enough for tiers
    const pct = tierFor(balance, (tiersRes.data ?? []) as ShopTier[])?.percent ?? 0;

    const merchList = [...lines.entries()].reduce(
      (sum, [pid, qty]) => sum + (byId.get(pid)?.price_usdg ?? 0) * qty,
      0,
    );
    const usdg_due = merchList * (1 - pct / 100);
    const shipping = shippingUsdg();
    const total_usdg = usdg_due + shipping;
    const due = infinityDueRaw(total_usdg, priceUsdg);
    if (due <= 0n) return fail(502, "Quote produced a zero amount — try again.");

    const { data: order, error } = await sb
      .from("shop_orders")
      .insert({
        wallet: signer,
        discount_pct: pct,
        usdg_due,
        shipping_usdg: shipping,
        total_usdg,
        infinity_raw_due: due.toString(),
        status: "awaiting_payment",
      })
      .select()
      .single();
    if (error || !order) {
      return fail(502, `Could not create order: ${error?.message ?? "insert failed"}`);
    }

    const { error: iErr } = await sb.from("shop_order_items").insert(
      [...lines.entries()].map(([pid, qty]) => ({
        order_id: order.id,
        product_id: pid,
        qty,
        price_usdg: byId.get(pid)?.price_usdg ?? 0,
        title: byId.get(pid)?.title ?? `#${pid}`,
      })),
    );
    if (iErr) {
      // Roll back the orphan order — no transaction across PostgREST calls.
      await sb.from("shop_orders").delete().eq("id", order.id);
      return fail(502, `Could not save order items: ${iErr.message}`);
    }

    return NextResponse.json({
      ok: true,
      order,
      items: [...lines.entries()].map(([pid, qty]) => ({
        product_id: pid,
        qty,
        title: byId.get(pid)?.title ?? `#${pid}`,
        price_usdg: byId.get(pid)?.price_usdg ?? 0,
      })),
      shopWallet: SHOP_WALLET,
      shippingUsdg: shipping,
    });
  }

  if (action === "pay") {
    if (!SHOP_WALLET) return fail(503, "Shop wallet is not configured.");
    const order_id = payOrderId;
    const tx_hash = String(body.tx_hash ?? "").toLowerCase();
    if (!Number.isInteger(order_id)) return fail(400, "Missing order id.");
    if (!TX_RE.test(tx_hash)) return fail(400, "That does not look like a tx hash.");

    const { data: order } = await sb
      .from("shop_orders")
      .select("*, shop_order_items(product_id, qty)")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return fail(404, "Order not found.");
    if (order.wallet !== signer) return fail(403, "Not your order.");
    if (order.status !== "awaiting_payment") {
      return fail(400, `Order is already ${order.status}.`);
    }

    // The same tx hash can only satisfy one order.
    const { data: used } = await sb
      .from("shop_orders")
      .select("id")
      .eq("tx_hash", tx_hash)
      .maybeSingle();
    if (used && used.id !== order_id) {
      return fail(400, "That tx is already attached to another order.");
    }

    // Verify on-chain — the node receipt is the source of truth, not the
    // explorer API. Requires a successful receipt on chain 4663.
    let tx;
    try {
      tx = await txReceiptTransfers(tx_hash);
    } catch {
      return fail(502, "Could not reach the chain — try again.");
    }
    if (!tx.found) {
      return fail(400, "Transaction not found on Robinhood Chain yet — wait for confirmation and retry.");
    }
    if (!tx.success) return fail(400, "That transaction did not succeed.");

    const due = BigInt(order.infinity_raw_due);
    const token = TOKEN.address.toLowerCase();
    const match = tx.transfers.find(
      (t) =>
        t.token === token &&
        t.from === signer &&
        t.to === SHOP_WALLET &&
        t.value >= due,
    );
    if (!match) {
      return fail(
        400,
        "No INFINITY transfer from your wallet to the shop wallet covering the amount due.",
      );
    }

    const { error } = await sb
      .from("shop_orders")
      .update({
        status: "paid_need_address",
        tx_hash,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .eq("status", "awaiting_payment"); // guard against double-submit races
    if (error) {
      return fail(
        error.code === "23505" ? 400 : 502,
        error.code === "23505"
          ? "That tx is already attached to another order."
          : `Could not mark order paid: ${error.message}`,
      );
    }

    // Decrement stock atomically per line — Postgres enforces stock >= qty.
    // If any line can't be fulfilled the payment is real but unshippable:
    // flag needs_refund instead of letting it queue for shipping.
    const lines: { product_id: number | null; qty: number }[] =
      (order.shop_order_items as { product_id: number | null; qty: number }[] | null) ??
      (order.product_id != null && order.qty != null
        ? [{ product_id: order.product_id, qty: order.qty }]
        : []);
    for (const it of lines) {
      if (it.product_id == null) continue;
      const { data: ok, error: sErr } = await sb.rpc("decrement_stock", {
        pid: it.product_id,
        q: it.qty,
      });
      if (sErr || ok !== true) {
        await sb
          .from("shop_orders")
          .update({ status: "needs_refund" })
          .eq("id", order_id)
          .eq("status", "paid_need_address");
        return fail(
          409,
          "Payment received but an item sold out — this order is flagged for refund.",
        );
      }
    }
    return NextResponse.json({ ok: true, status: "paid_need_address" });
  }

  return fail(400, `Unknown action "${action}".`);
}
