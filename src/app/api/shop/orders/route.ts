import { NextResponse } from "next/server";
import {
  readBalanceRaw,
  serviceSupabase,
  shopPriceUsdg,
  txTransfers,
  verifyWalletProof,
} from "@/lib/shopServer";
import { infinityDueRaw, tierFor, SHOP_WALLET } from "@/lib/shop";
import { TOKEN } from "@/lib/constants";
import type { ShopTier } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/shop/orders
//   { action: "mine",   wallet, iso, signature }
//   { action: "create", wallet, iso, signature, product_id, qty }
//   { action: "pay",    wallet, iso, signature, order_id, tx_hash }
// Every action needs a valid login proof — the recovered signer is the only
// wallet the order can belong to. Prices/discounts are recomputed
// server-side; nothing the client sends is trusted.
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
  const signer = await verifyWalletProof(wallet, iso, signature);
  if (!signer) return fail(401, "Invalid or stale wallet signature — sign in again.");

  if (action === "mine") {
    const { data, error } = await sb
      .from("shop_orders")
      .select("*, shop_products(title)")
      .eq("wallet", signer)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return fail(502, `Could not load orders: ${error.message}`);
    return NextResponse.json({ ok: true, orders: data ?? [] });
  }

  if (action === "create") {
    if (!SHOP_WALLET) return fail(503, "Shop wallet is not configured.");
    const product_id = Number(body.product_id);
    const qty = Math.floor(Number(body.qty));
    if (!Number.isInteger(product_id) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return fail(400, "Bad product or quantity.");
    }

    const { data: product, error: pErr } = await sb
      .from("shop_products")
      .select("*")
      .eq("id", product_id)
      .maybeSingle();
    if (pErr || !product) return fail(404, "Product not found.");
    if (!product.active) return fail(400, "Product is not on sale yet.");
    if (product.stock < qty) return fail(400, "Not enough stock.");

    // Recompute the discount from the wallet's live on-chain balance.
    const [rawBal, tiersRes, priceUsdg] = await Promise.all([
      readBalanceRaw(signer).catch(() => null),
      sb.from("shop_tiers").select("*"),
      shopPriceUsdg(),
    ]);
    if (rawBal == null) return fail(502, "Could not read your balance on-chain.");
    if (priceUsdg == null) return fail(502, "No INFINITY quote available — try again.");

    const balance = Number(rawBal / 10n ** 18n); // whole-token precision is enough for tiers
    const tiers = (tiersRes.data ?? []) as ShopTier[];
    const tier = tierFor(balance, tiers);
    const pct = tier?.percent ?? 0;
    const usdg_due = product.price_usdg * qty * (1 - pct / 100);
    const due = infinityDueRaw(usdg_due, priceUsdg);
    if (due <= 0n) return fail(502, "Quote produced a zero amount — try again.");

    const { data: order, error } = await sb
      .from("shop_orders")
      .insert({
        wallet: signer,
        product_id,
        qty,
        price_usdg: product.price_usdg,
        discount_pct: pct,
        usdg_due,
        infinity_raw_due: due.toString(),
        status: "awaiting_tx",
      })
      .select()
      .single();
    if (error) return fail(502, `Could not create order: ${error.message}`);
    return NextResponse.json({ ok: true, order, shopWallet: SHOP_WALLET });
  }

  if (action === "pay") {
    if (!SHOP_WALLET) return fail(503, "Shop wallet is not configured.");
    const order_id = Number(body.order_id);
    const tx_hash = String(body.tx_hash ?? "").toLowerCase();
    if (!Number.isInteger(order_id)) return fail(400, "Missing order id.");
    if (!TX_RE.test(tx_hash)) return fail(400, "That does not look like a tx hash.");

    const { data: order } = await sb
      .from("shop_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return fail(404, "Order not found.");
    if (order.wallet !== signer) return fail(403, "Not your order.");
    if (order.status !== "awaiting_tx") {
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

    const tx = await txTransfers(tx_hash);
    if (!tx.ok) return fail(400, "Transaction not found on Robinhood Chain yet — wait for confirmation and retry.");
    if (tx.status !== "ok") return fail(400, "That transaction did not succeed.");

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
        status: "paid_pending_ship",
        tx_hash,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .eq("status", "awaiting_tx"); // guard against double-submit races
    if (error) {
      return fail(
        error.code === "23505" ? 400 : 502,
        error.code === "23505"
          ? "That tx is already attached to another order."
          : `Could not mark order paid: ${error.message}`,
      );
    }
    return NextResponse.json({ ok: true, status: "paid_pending_ship" });
  }

  return fail(400, `Unknown action "${action}".`);
}
