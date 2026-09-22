"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/AuthContext";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { supabase } from "@/lib/supabase";
import { loadSession } from "@/lib/auth";
import { CHAIN, LINKS, TOKEN } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";
import {
  DEFAULT_MIN_TOKENS,
  SHOP_WALLET,
  formatInfinityRaw,
  rawToDecimalString,
  tierFor,
  validateShipment,
  type CartLine,
  type ShopOrder,
  type ShopProduct,
  type ShopTier,
  type ShipmentInput,
} from "@/lib/shop";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const EMPTY_SHIPMENT: ShipmentInput = {
  recipient_name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal: "",
  country: "",
  phone: "",
};

// Stored login proof reused as the write signature — same pattern as the
// avatar upload. If the session has no usable proof the caller triggers
// verify() once, then re-reads.
function sessionProof(): { wallet: string; iso: string; signature: string } | null {
  const s = loadSession();
  if (!s?.proof) return null;
  return { wallet: s.wallet, iso: s.proof.iso, signature: s.proof.signature };
}

export default function ShopPage() {
  const { status, address, connect, verify } = useAuth();
  const { balance, raw: rawBalance, isLoading: balLoading } = useInfinityBalance();

  const [minTokens, setMinTokens] = useState(DEFAULT_MIN_TOKENS);
  const [tiers, setTiers] = useState<ShopTier[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [addressOrder, setAddressOrder] = useState<ShopOrder | null>(null);
  const [payOrder, setPayOrder] = useState<ShopOrder | null>(null);

  const wallet = address?.toLowerCase();
  const cartKey = wallet ? `ib_cart_${wallet}` : null;

  // Catalog data is public-read — plain anon selects, no signature needed.
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("shop_settings").select("value").eq("key", "shop_min_tokens").maybeSingle(),
      supabase.from("shop_tiers").select("*").order("sort"),
      supabase.from("shop_products").select("*").order("sort"),
    ]).then(([s, t, p]) => {
      const min = Number(s.data?.value);
      if (Number.isFinite(min) && min > 0) setMinTokens(min);
      setTiers((t.data as ShopTier[]) ?? []);
      setProducts((p.data as ShopProduct[]) ?? []);
      setCatalogReady(true);
    });
  }, []);

  // Cart persists per wallet in localStorage.
  useEffect(() => {
    if (!cartKey) {
      setCart([]);
      return;
    }
    try {
      const raw = localStorage.getItem(cartKey);
      const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
      setCart(
        Array.isArray(parsed)
          ? parsed.filter(
              (l) => Number.isInteger(l.product_id) && Number.isInteger(l.qty) && l.qty > 0,
            )
          : [],
      );
    } catch {
      setCart([]);
    }
  }, [cartKey]);

  const saveCart = useCallback(
    (next: CartLine[]) => {
      setCart(next);
      if (cartKey) {
        try {
          localStorage.setItem(cartKey, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
      }
    },
    [cartKey],
  );

  const addToCart = useCallback(
    (p: ShopProduct) => {
      const cur = cart.find((l) => l.product_id === p.id)?.qty ?? 0;
      if (cur >= p.stock) return;
      saveCart(
        cur > 0
          ? cart.map((l) => (l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l))
          : [...cart, { product_id: p.id, qty: 1 }],
      );
    },
    [cart, saveCart],
  );

  const setQty = useCallback(
    (product_id: number, qty: number) => {
      saveCart(
        qty <= 0
          ? cart.filter((l) => l.product_id !== product_id)
          : cart.map((l) => (l.product_id === product_id ? { ...l, qty } : l)),
      );
    },
    [cart, saveCart],
  );

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
  const eligible = balance != null && balance >= minTokens;
  const tier = balance != null ? tierFor(balance, tiers) : null;
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);

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
          Holders only
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-5xl">
          Infinite Bucket <span className="text-chrome">Shop</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
          Hold more $INFINITY, pay less. Price set in USDG, charged in $INFINITY.
          Pay in $INFINITY first — then we ask where to send it. We do not publish
          your address.
        </p>
      </header>

      {!connected ? (
        <ConnectCard status={status} onConnect={connect} />
      ) : balLoading || !catalogReady ? (
        <div className="glass h-56 animate-pulse" />
      ) : !eligible ? (
        <LockCard balance={balance ?? 0} min={minTokens} />
      ) : (
        <>
          <TierBanner tier={tier} tiers={tiers} balance={balance} />
          <ProductGrid products={products} cart={cart} onAdd={addToCart} />
          <OrdersList
            orders={orders}
            onAddAddress={setAddressOrder}
            onResumePay={setPayOrder}
          />
        </>
      )}

      {/* Cart bar */}
      <AnimatePresence>
        {connected && eligible && cartCount > 0 && !cartOpen && (
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
            wallet={address}
            verify={verify}
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
            wallet={address}
            verify={verify}
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

/* ── Connect gate ──────────────────────────────────────────────────────── */

function ConnectCard({ status, onConnect }: { status: string; onConnect: () => void }) {
  const signing = status === "connecting" || status === "signing" || status === "needs_verify";
  return (
    <div className="glass mx-auto max-w-md p-8 text-center">
      <BucketIcon className="mx-auto h-12 w-12 text-[var(--color-chrome)]" />
      <h2 className="mt-4 font-display text-xl font-bold text-[var(--color-white-soft)]">
        Sign in to enter the shop
      </h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        We read your $INFINITY balance to unlock holder pricing.
      </p>
      <button
        type="button"
        onClick={onConnect}
        disabled={signing && status !== "needs_verify"}
        className="btn-metal mt-6 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {status === "needs_verify"
          ? "Sign in with wallet"
          : signing
            ? "Check your wallet…"
            : "Connect wallet"}
      </button>
    </div>
  );
}

/* ── Lock page ─────────────────────────────────────────────────────────── */

function LockCard({ balance, min }: { balance: number; min: number }) {
  const pct = Math.min(100, (balance / min) * 100);
  return (
    <div className="glass mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.7)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--color-chrome)]">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold text-[var(--color-white-soft)]">
        Holder&rsquo;s store
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Hold <span className="font-mono text-[var(--color-chrome)]">{fmt(min)}</span> $INFINITY in
        one wallet to unlock the shop.
      </p>
      <div className="mt-6">
        <div className="flex justify-between font-mono text-xs text-[var(--color-muted)]">
          <span>Balance: {fmt(balance)}</span>
          <span>{fmt(min)} required</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7a5cff] to-[#c4a0ff] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <a
        href={LINKS.trade}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-metal mt-6 inline-block rounded-xl px-6 py-3 text-sm font-semibold"
      >
        Buy $INFINITY
      </a>
    </div>
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
  onAdd,
}: {
  products: ShopProduct[];
  cart: CartLine[];
  onAdd: (p: ShopProduct) => void;
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
        const canAdd = p.active && p.stock > inCart;
        return (
          <article key={p.id} className="glass group overflow-hidden">
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
            <div className="p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
                  {p.title}
                </h3>
                <span className="font-mono text-lg text-[var(--color-chrome)]">
                  {fmt(p.price_usdg)} <span className="text-xs text-[var(--color-muted)]">USDG</span>
                </span>
              </div>
              {p.blurb && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{p.blurb}</p>
              )}
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
            </div>
          </article>
        );
      })}
    </div>
  );
}

// Photoreal-ish metal placeholder while no product photo is set — a beveled
// amethyst disc under a hard light, matching the brand's metal look.
function MetalDisc() {
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="h-44 w-44 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #e8dcff 0%, #b08cf0 18%, #6d4fc2 45%, #2c1b52 78%, #160d2a 100%)",
          boxShadow:
            "inset 0 -8px 24px rgba(0,0,0,0.55), inset 0 6px 18px rgba(255,255,255,0.22), 0 18px 44px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}

/* ── My orders ─────────────────────────────────────────────────────────── */

function orderItemsSummary(o: ShopOrder): string {
  const items = o.shop_order_items ?? [];
  if (items.length > 0) {
    return items
      .map((i) => `${i.shop_products?.title ?? `#${i.product_id}`} ×${i.qty}`)
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

/* ── Checkout modal: cart → pay → ship ─────────────────────────────────── */

type Quote = { ok: boolean; priceUsdg: number | null; shippingUsdg?: number };
type CartLineFull = CartLine & { product: ShopProduct };
type CreatedOrder = ShopOrder;

function CheckoutModal({
  lines,
  wallet,
  balance,
  tiers,
  setQty,
  verify,
  onClose,
  onPaid,
  onDone,
}: {
  lines: CartLineFull[];
  wallet: string;
  balance: number;
  tiers: ShopTier[];
  setQty: (id: number, qty: number) => void;
  verify: () => Promise<void>;
  onClose: () => void;
  onPaid: () => void;
  onDone: () => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [step, setStep] = useState<"cart" | "pay" | "ship">("cart");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shop/quote")
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => setQuote({ ok: false, priceUsdg: null }));
  }, []);

  const tier = tierFor(balance, tiers);
  const pct = tier?.percent ?? 0;
  const shipping = quote?.shippingUsdg ?? 6;
  const merchList = lines.reduce((s, l) => s + l.product.price_usdg * l.qty, 0);
  const merchDue = merchList * (1 - pct / 100);
  const totalUsdg = merchDue + shipping;
  const estInfinity =
    quote?.ok && quote.priceUsdg ? Math.ceil(totalUsdg / quote.priceUsdg) : null;

  // Ensure a usable proof exists; re-sign once if the session lacks one.
  const proof = async () => {
    let p = sessionProof();
    if (!p || p.wallet !== wallet.toLowerCase()) {
      await verify();
      p = sessionProof();
    }
    return p;
  };

  const createOrder = async () => {
    if (busy || lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...p,
          items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not create order.");
      setOrder(j.order as CreatedOrder);
      setStep("pay");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitTx = async () => {
    if (busy || !order) return;
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          ...p,
          order_id: order.id,
          tx_hash: txHash.trim(),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Payment not verified.");
      onPaid();
      setStep("ship");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,4,12,0.8)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
            {step === "cart" ? "Cart" : step === "pay" ? "Pay with $INFINITY" : "Where to send it"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-muted)] transition hover:text-[var(--color-white-soft)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {step === "cart" && (
          <>
            <div className="mt-4 space-y-2">
              {lines.map((l) => (
                <div
                  key={l.product_id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.5)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-white-soft)]">
                      {l.product.title}
                    </p>
                    <p className="font-mono text-xs text-[var(--color-muted)]">
                      {fmt(l.product.price_usdg, 2)} USDG
                    </p>
                  </div>
                  <div className="flex items-center rounded-lg border border-[var(--color-stroke)]">
                    <button
                      type="button"
                      className="px-2.5 py-1 text-[var(--color-chrome)]"
                      onClick={() => setQty(l.product_id, l.qty - 1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-mono text-xs">{l.qty}</span>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-[var(--color-chrome)] disabled:opacity-30"
                      disabled={l.qty >= l.product.stock}
                      onClick={() => setQty(l.product_id, l.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <dl className="mt-5 space-y-2 border-t border-[var(--color-stroke)] pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Subtotal</dt>
                <dd className="font-mono">{fmt(merchList, 2)} USDG</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">
                  Holder discount{tier?.label ? ` (${tier.label})` : ""}
                </dt>
                <dd className="font-mono text-[var(--color-live)]">−{pct}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Flat shipping</dt>
                <dd className="font-mono">{fmt(shipping, 2)} USDG</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--color-stroke)] pt-2 font-semibold">
                <dt className="text-[var(--color-white-soft)]">Total</dt>
                <dd className="font-mono">{fmt(totalUsdg, 2)} USDG</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Due in $INFINITY</dt>
                <dd className="font-mono text-[var(--color-chrome)]">
                  {estInfinity != null ? `≈ ${fmt(estInfinity)}` : "…"}
                </dd>
              </div>
            </dl>

            {error && <p className="mt-4 text-sm text-[var(--color-sell)]">{error}</p>}
            <button
              type="button"
              onClick={createOrder}
              disabled={busy || lines.length === 0}
              className="btn-metal mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Reserving…" : "Reserve order — get payment details"}
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-muted)]">
              Pay in $INFINITY first. Then we ask where to send it. We do not
              publish your address.
            </p>
          </>
        )}

        {step === "pay" && order && (
          <PayStep
            order={order}
            txHash={txHash}
            setTxHash={setTxHash}
            busy={busy}
            error={error}
            onSubmit={submitTx}
          />
        )}

        {step === "ship" && order && (
          <ShipmentForm
            orderId={order.id}
            proof={proof}
            busy={busy}
            setBusy={setBusy}
            error={error}
            setError={setError}
            onDone={onDone}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── Shipping form (shared by checkout step + My orders) ───────────────── */

function ShipmentForm({
  orderId,
  proof,
  busy,
  setBusy,
  error,
  setError,
  onDone,
}: {
  orderId: number;
  proof: () => Promise<{ wallet: string; iso: string; signature: string } | null>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<ShipmentInput>({ ...EMPTY_SHIPMENT });
  const [saved, setSaved] = useState(false);

  const field = (k: keyof ShipmentInput, label: string, required = false) => (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--color-muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="text"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        maxLength={200}
        className="w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2.5 text-sm text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
      />
    </label>
  );

  const submit = async () => {
    if (busy) return;
    const vErr = validateShipment(f);
    if (vErr) {
      setError(vErr);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/shipment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set", ...p, order_id: orderId, ...f }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not save address.");
      setSaved(true);
      setTimeout(onDone, 1600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="py-8 text-center">
        <p className="font-display text-lg font-bold text-[var(--color-live)]">Order complete</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Payment verified, address saved — your order is pending shipment.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Payment verified. Where should it ship? Your address is stored
        encrypted and is never public.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">{field("recipient_name", "Recipient name", true)}</div>
        <div className="col-span-2">{field("line1", "Address line 1", true)}</div>
        <div className="col-span-2">{field("line2", "Address line 2")}</div>
        {field("city", "City", true)}
        {field("region", "State / region")}
        {field("postal", "Postal code", true)}
        {field("country", "Country", true)}
        <div className="col-span-2">{field("phone", "Phone (optional)")}</div>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--color-sell)]">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn-metal mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save shipping address"}
      </button>
    </>
  );
}

/* ── Standalone address modal for paid_need_address orders ─────────────── */

function AddressModal({
  order,
  wallet,
  verify,
  onClose,
  onDone,
}: {
  order: ShopOrder;
  wallet: string;
  verify: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proof = async () => {
    let p = sessionProof();
    if (!p || p.wallet !== wallet.toLowerCase()) {
      await verify();
      p = sessionProof();
    }
    return p;
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,4,12,0.8)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
            Shipping for order #{order.id}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-[var(--color-muted)] transition hover:text-[var(--color-white-soft)]">
            ✕
          </button>
        </div>
        <ShipmentForm
          orderId={order.id}
          proof={proof}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          onDone={onDone}
        />
      </motion.div>
    </motion.div>
  );
}

/* ── Pay step (shared by checkout + "complete payment" resume) ─────────── */

function PayStep({
  order,
  txHash,
  setTxHash,
  busy,
  error,
  onSubmit,
}: {
  order: ShopOrder;
  txHash: string;
  setTxHash: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
        Send <span className="font-semibold text-[var(--color-white-soft)]">exactly</span> this
        amount (merch + shipping) on Robinhood Chain:
      </p>
      <div className="mt-4 space-y-3">
        <CopyRow
          label="$INFINITY due (exact)"
          display={`${rawToDecimalString(order.infinity_raw_due)} INFINITY`}
          copy={rawToDecimalString(order.infinity_raw_due)}
        />
        <CopyRow
          label="To (shop wallet)"
          display={truncateAddress(SHOP_WALLET, 8)}
          copy={SHOP_WALLET}
        />
        <CopyRow
          label="$INFINITY contract"
          display={truncateAddress(TOKEN.address, 8)}
          copy={TOKEN.address}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
        After sending, paste the transaction hash:
      </p>
      <input
        type="text"
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
        placeholder="0x…"
        className="mt-2 w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-xs text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
      />
      {error && <p className="mt-3 text-sm text-[var(--color-sell)]">{error}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
        className="btn-metal mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Checking on-chain…" : "I sent it — verify payment"}
      </button>
      <a
        href={`${CHAIN.explorer}/address/${SHOP_WALLET}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center font-mono text-xs text-[var(--color-chrome)] underline decoration-[var(--color-stroke)] underline-offset-4 hover:text-[var(--color-white-soft)]"
      >
        View shop wallet on Blockscout ↗
      </a>
    </>
  );
}

// Resume payment for an awaiting_payment order from "My orders".
function PayModal({
  order,
  wallet,
  verify,
  onClose,
  onPaid,
}: {
  order: ShopOrder;
  wallet: string;
  verify: () => Promise<void>;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proof = async () => {
    let p = sessionProof();
    if (!p || p.wallet !== wallet.toLowerCase()) {
      await verify();
      p = sessionProof();
    }
    return p;
  };

  const submitTx = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          ...p,
          order_id: order.id,
          tx_hash: txHash.trim(),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Payment not verified.");
      onPaid();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,4,12,0.8)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
            Pay order #{order.id}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-[var(--color-muted)] transition hover:text-[var(--color-white-soft)]">
            ✕
          </button>
        </div>
        <PayStep
          order={order}
          txHash={txHash}
          setTxHash={setTxHash}
          busy={busy}
          error={error}
          onSubmit={submitTx}
        />
      </motion.div>
    </motion.div>
  );
}

function CopyRow({ label, display, copy }: { label: string; display: string; copy: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(copy);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3 text-left transition hover:border-[rgba(196,160,255,0.35)]"
    >
      <span>
        <span className="block font-mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--color-muted)]">
          {label}
        </span>
        <span className="mt-0.5 block break-all font-mono text-sm text-[var(--color-chrome)]">
          {display}
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="17" cy="20" r="1.6" />
      <path d="M3 3h2l2.4 12h10.4l2-8H6.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BucketIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 8h16l-1.6 11.2A2 2 0 0 1 16.4 21H7.6a2 2 0 0 1-2-1.8L4 8Z" />
      <path d="M8 8a4 4 0 0 1 8 0" strokeLinecap="round" />
    </svg>
  );
}
