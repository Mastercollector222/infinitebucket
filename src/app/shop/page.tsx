"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/AuthContext";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { useShopCart } from "@/hooks/useShopCart";
import { supabase } from "@/lib/supabase";
import { LINKS } from "@/lib/constants";
import {
  formatInfinityRaw,
  tierFor,
  type ShopOrder,
  type ShopProduct,
  type ShopTier,
} from "@/lib/shop";
import {
  AddressModal,
  CartIcon,
  CheckoutModal,
  MetalDisc,
  PayModal,
  sessionProof,
  type CartLineFull,
} from "@/components/shop/Checkout";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export default function ShopPage() {
  const { status, address, connect, verify, signAction } = useAuth();
  const { balance, raw: rawBalance, isLoading: balLoading } = useInfinityBalance();
  const { cart, cartCount, addToCart, setQty, saveCart } = useShopCart(address);

  const [tiers, setTiers] = useState<ShopTier[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [addressOrder, setAddressOrder] = useState<ShopOrder | null>(null);
  const [payOrder, setPayOrder] = useState<ShopOrder | null>(null);

  // Catalog data is public-read — every visitor browses, no signature needed.
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("shop_tiers").select("*").order("sort"),
      supabase.from("shop_products").select("*").order("sort"),
    ]).then(([t, p]) => {
      setTiers((t.data as ShopTier[]) ?? []);
      setProducts((p.data as ShopProduct[]) ?? []);
      setCatalogReady(true);
    });
  }, []);

  const loadOrders = useCallback(async () => {
    const proof = sessionProof();
    if (!proof || !address) return;
    try {
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mine", ...proof }),
      });
      const j = await res.json();
      if (j.ok) setOrders(j.orders as ShopOrder[]);
    } catch {
      /* orders stay empty */
    }
  }, [address]);

  useEffect(() => {
    if (status === "ready") loadOrders();
  }, [status, loadOrders]);

  const connected = status === "ready" || status === "needs_username";
  const tier = connected && balance != null ? tierFor(balance, tiers) : null;

  const cartLines = useMemo(
    () =>
      cart
        .map((l) => ({ ...l, product: products.find((p) => p.id === l.product_id) }))
        .filter((l): l is CartLineFull => l.product != null),
    [cart, products],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-14 sm:px-6">
      <header className="mb-10">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--color-live)]">
          Infinite Bucket Shop
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-5xl">
          Hold more. <span className="text-chrome">Pay less.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
          Price set in USDG, charged in $INFINITY. Pay in $INFINITY first — then
          we ask where to send it. We do not publish your address.
        </p>
      </header>

      {!catalogReady ? (
        <div className="glass h-56 animate-pulse" />
      ) : (
        <>
          {connected && !balLoading && (
            <TierBanner tier={tier} tiers={tiers} balance={balance ?? 0} />
          )}
          <ProductGrid
            products={products}
            cart={cart}
            balance={connected ? balance : null}
            connected={connected}
            onAdd={addToCart}
            onConnect={connect}
          />
          {connected && (
            <OrdersList
              orders={orders}
              onAddAddress={setAddressOrder}
              onResumePay={setPayOrder}
            />
          )}
        </>
      )}

      {/* Cart bar */}
      <AnimatePresence>
        {connected && cartCount > 0 && !cartOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => setCartOpen(true)}
            className="btn-metal fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-6 py-3.5 font-semibold shadow-2xl"
          >
            <CartIcon />
            Cart · {cartCount} item{cartCount === 1 ? "" : "s"} — checkout
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cartOpen && address && rawBalance != null && (
          <CheckoutModal
            lines={cartLines}
            wallet={address}
            balance={balance ?? 0}
            tiers={tiers}
            setQty={setQty}
            verify={verify}
            signAction={signAction}
            onClose={() => setCartOpen(false)}
            onPaid={() => {
              saveCart([]); // items are committed once payment verifies
              loadOrders();
            }}
            onDone={() => {
              setCartOpen(false);
              saveCart([]);
              loadOrders();
            }}
          />
        )}
        {payOrder && address && (
          <PayModal
            order={payOrder}
            signAction={signAction}
            onClose={() => setPayOrder(null)}
            onPaid={() => {
              const o = payOrder;
              setPayOrder(null);
              loadOrders();
              setAddressOrder(o); // straight into the shipping form
            }}
          />
        )}
        {addressOrder && address && (
          <AddressModal
            order={addressOrder}
            signAction={signAction}
            onClose={() => setAddressOrder(null)}
            onDone={() => {
              setAddressOrder(null);
              loadOrders();
            }}
          />
        )}
      </AnimatePresence>

      <p className="mt-14 text-center text-xs leading-relaxed text-[var(--color-muted)]">
        Merch, not a metal-backed token. Not an exchange. Not financial advice.
      </p>
    </main>
  );
}

/* ── Tier banner ───────────────────────────────────────────────────────── */

function TierBanner({
  tier,
  tiers,
  balance,
}: {
  tier: ShopTier | null;
  tiers: ShopTier[];
  balance: number;
}) {
  const next = tiers
    .filter((t) => t.min_tokens > balance)
    .sort((a, b) => a.min_tokens - b.min_tokens)[0];
  return (
    <div className="glass mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
      <div>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
          Your tier
        </p>
        <p className="mt-1 font-display text-xl font-bold text-[var(--color-white-soft)]">
          {tier?.label || "Holder"}
          <span className="ml-2 font-mono text-sm text-[var(--color-live)]">
            {tier?.percent ?? 0}% off
          </span>
        </p>
      </div>
      {next && (
        <p className="text-xs text-[var(--color-muted)]">
          <span className="font-mono text-[var(--color-chrome)]">
            {fmt(next.min_tokens - balance)}
          </span>{" "}
          more $INFINITY → {next.percent}% off ({next.label})
        </p>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        {tiers.map((t) => (
          <span
            key={t.id}
            className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] ${
              balance >= t.min_tokens
                ? "border-[var(--color-live)]/40 bg-[rgba(62,224,164,0.08)] text-[var(--color-live)]"
                : "border-[var(--color-stroke)] text-[var(--color-muted)]"
            }`}
          >
            {fmt(t.min_tokens)}+ · {t.percent}%
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Product grid ──────────────────────────────────────────────────────── */

function ProductGrid({
  products,
  cart,
  balance,
  connected,
  onAdd,
  onConnect,
}: {
  products: ShopProduct[];
  cart: { product_id: number; qty: number }[];
  balance: number | null;
  connected: boolean;
  onAdd: (p: ShopProduct) => void;
  onConnect: () => void;
}) {
  if (products.length === 0) {
    return (
      <div className="glass p-10 text-center text-sm text-[var(--color-muted)]">
        Shelves are being stocked — check back soon.
      </div>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {products.map((p) => {
        const inCart = cart.find((l) => l.product_id === p.id)?.qty ?? 0;
        const minReq = Number(p.min_infinity_tokens) || 0;
        const gated = connected && balance != null && balance < minReq;
        // minReq > 0 needs a loaded balance before the button can unlock.
        const canAdd =
          p.active && p.stock > inCart && connected && !gated &&
          (minReq === 0 || balance != null);
        return (
          <article key={p.id} className="glass group overflow-hidden">
            <Link href={`/shop/${p.id}`} className="block">
              <div className="relative aspect-[4/3] overflow-hidden bg-[rgba(14,8,22,0.7)]">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <MetalDisc />
                )}
                {!p.active && (
                  <span className="absolute left-4 top-4 rounded-full border border-[rgba(196,160,255,0.35)] bg-[rgba(10,6,16,0.75)] px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--color-chrome)] backdrop-blur">
                    Coming soon
                  </span>
                )}
              </div>
            </Link>
            <div className="p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
                  <Link href={`/shop/${p.id}`} className="transition hover:text-[var(--color-chrome)]">
                    {p.title}
                  </Link>
                </h3>
                <span className="font-mono text-lg text-[var(--color-chrome)]">
                  {fmt(p.price_usdg)} <span className="text-xs text-[var(--color-muted)]">USDG</span>
                </span>
              </div>
              {minReq > 0 && (
                <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Hold {fmt(minReq)} $INFINITY to buy
                </p>
              )}
              {p.blurb && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{p.blurb}</p>
              )}
              {!connected ? (
                <button
                  type="button"
                  onClick={onConnect}
                  className="btn-ghost mt-5 w-full rounded-xl px-4 py-3 text-sm font-medium"
                >
                  Connect to add
                </button>
              ) : gated ? (
                <div className="mt-5 space-y-2">
                  <div className="rounded-xl border border-[rgba(196,160,255,0.3)] bg-[rgba(28,20,44,0.5)] px-4 py-3 text-center font-mono text-xs text-[var(--color-chrome)]">
                    Hold {fmt(minReq)} $INFINITY to add
                  </div>
                  <a
                    href={LINKS.trade}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-metal block rounded-xl px-4 py-3 text-center text-sm font-semibold"
                  >
                    Buy $INFINITY
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => onAdd(p)}
                  className="btn-metal mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {!p.active
                    ? "Coming soon"
                    : p.stock < 1
                      ? "Sold out"
                      : inCart > 0
                        ? `In cart ×${inCart} — add another`
                        : "Add to cart"}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ── My orders ─────────────────────────────────────────────────────────── */

function orderItemsSummary(o: ShopOrder): string {
  const items = o.shop_order_items ?? [];
  if (items.length > 0) {
    return items
      .map(
        (i) => `${i.title || i.shop_products?.title || `#${i.product_id}`} ×${i.qty}`,
      )
      .join(", ");
  }
  return "—";
}

function OrdersList({
  orders,
  onAddAddress,
  onResumePay,
}: {
  orders: ShopOrder[];
  onAddAddress: (o: ShopOrder) => void;
  onResumePay: (o: ShopOrder) => void;
}) {
  if (orders.length === 0) return null;
  const label: Record<string, string> = {
    awaiting_payment: "Awaiting payment",
    paid_need_address: "Paid — address needed",
    paid_pending_ship: "Paid — pending ship",
    needs_refund: "Refund needed",
    shipped: "Shipped",
    cancelled: "Cancelled",
  };
  return (
    <section className="mt-12">
      <h2 className="mb-4 font-display text-xl font-bold text-[var(--color-white-soft)]">
        My orders
      </h2>
      <div className="glass divide-y divide-[var(--color-stroke)]">
        {orders.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
            <span className="font-mono text-[var(--color-muted)]">#{o.id}</span>
            <span className="font-medium text-[var(--color-white-soft)]">
              {orderItemsSummary(o)}
            </span>
            <span className="font-mono text-xs text-[var(--color-chrome)]">
              {formatInfinityRaw(o.infinity_raw_due)} INFINITY
            </span>
            {o.status === "awaiting_payment" ? (
              <button
                type="button"
                onClick={() => onResumePay(o)}
                className="btn-metal ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Complete payment
              </button>
            ) : o.status === "paid_need_address" ? (
              <button
                type="button"
                onClick={() => onAddAddress(o)}
                className="btn-metal ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Add shipping address
              </button>
            ) : (
              <span
                className={`ml-auto rounded-full border px-3 py-1 font-mono text-[0.65rem] ${
                  o.status === "shipped"
                    ? "border-[var(--color-live)]/40 text-[var(--color-live)]"
                    : o.status === "paid_pending_ship"
                      ? "border-[rgba(196,160,255,0.4)] text-[var(--color-chrome)]"
                      : "border-[var(--color-stroke)] text-[var(--color-muted)]"
                }`}
              >
                {label[o.status] ?? o.status}
              </span>
            )}
            {o.tracking_note && (
              <span className="w-full text-xs text-[var(--color-muted)]">
                Tracking: {o.tracking_note}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}


