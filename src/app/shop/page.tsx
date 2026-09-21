"use client";

import { useCallback, useEffect, useState } from "react";
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
  type ShopOrder,
  type ShopProduct,
  type ShopTier,
} from "@/lib/shop";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

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
  const [checkout, setCheckout] = useState<ShopProduct | null>(null);

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-14 sm:px-6">
      <header className="mb-10">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--color-live)]">
          Holders only
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-5xl">
          Infinite Bucket <span className="text-chrome">Shop</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
          Hold more $INFINITY, pay less. Price set in USDG, charged in $INFINITY.
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
          <ProductGrid products={products} onBuy={setCheckout} />
          <OrdersList orders={orders} />
        </>
      )}

      <AnimatePresence>
        {checkout && address && rawBalance != null && (
          <CheckoutModal
            product={checkout}
            wallet={address}
            tiers={tiers}
            balance={balance ?? 0}
            verify={verify}
            onClose={() => setCheckout(null)}
            onPaid={() => {
              setCheckout(null);
              loadOrders();
            }}
          />
        )}
      </AnimatePresence>

      <p className="mt-14 text-center text-xs leading-relaxed text-[var(--color-muted)]">
        Not an exchange. Not a metal-backed token. Merch paid in $INFINITY.
        <br />
        Not financial advice.
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
  onBuy,
}: {
  products: ShopProduct[];
  onBuy: (p: ShopProduct) => void;
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
      {products.map((p) => (
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
              disabled={!p.active || p.stock < 1}
              onClick={() => onBuy(p)}
              className="btn-metal mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!p.active ? "Coming soon" : p.stock < 1 ? "Sold out" : "Buy with $INFINITY"}
            </button>
          </div>
        </article>
      ))}
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

function OrdersList({ orders }: { orders: ShopOrder[] }) {
  if (orders.length === 0) return null;
  const label: Record<string, string> = {
    awaiting_tx: "Awaiting payment",
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
          <div key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 text-sm">
            <span className="font-mono text-[var(--color-muted)]">#{o.id}</span>
            <span className="font-medium text-[var(--color-white-soft)]">
              {o.shop_products?.title ?? `Product ${o.product_id}`} × {o.qty}
            </span>
            <span className="font-mono text-xs text-[var(--color-chrome)]">
              {formatInfinityRaw(o.infinity_raw_due)} INFINITY
            </span>
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

/* ── Checkout modal ────────────────────────────────────────────────────── */

type Quote = { ok: boolean; priceUsdg: number | null };

function CheckoutModal({
  product,
  wallet,
  tiers,
  balance,
  verify,
  onClose,
  onPaid,
}: {
  product: ShopProduct;
  wallet: string;
  tiers: ShopTier[];
  balance: number;
  verify: () => Promise<void>;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/shop/quote")
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => setQuote({ ok: false, priceUsdg: null }));
  }, []);

  const tier = tierFor(balance, tiers);
  const pct = tier?.percent ?? 0;
  const listUsdg = product.price_usdg * qty;
  const dueUsdg = listUsdg * (1 - pct / 100);
  const estInfinity =
    quote?.ok && quote.priceUsdg ? Math.ceil(dueUsdg / quote.priceUsdg) : null;

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
          action: "create",
          ...p,
          product_id: product.id,
          qty,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not create order.");
      setOrder(j.order as ShopOrder);
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
      setDone(true);
      setTimeout(onPaid, 2200);
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
            {product.title}
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

        {done ? (
          <div className="py-8 text-center">
            <p className="font-display text-lg font-bold text-[var(--color-live)]">
              Payment verified
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Order #{order?.id} is paid_pending_ship. The creator ships it.
            </p>
          </div>
        ) : !order ? (
          <>
            <div className="mt-5 flex items-center gap-3">
              <span className="text-sm text-[var(--color-muted)]">Qty</span>
              <div className="flex items-center rounded-xl border border-[var(--color-stroke)]">
                <button
                  type="button"
                  className="px-3 py-1.5 text-lg text-[var(--color-chrome)] disabled:opacity-30"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="w-8 text-center font-mono text-sm">{qty}</span>
                <button
                  type="button"
                  className="px-3 py-1.5 text-lg text-[var(--color-chrome)] disabled:opacity-30"
                  disabled={qty >= product.stock}
                  onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                >
                  +
                </button>
              </div>
              <span className="text-xs text-[var(--color-muted)]">
                {product.stock} in stock
              </span>
            </div>

            <dl className="mt-5 space-y-2 border-t border-[var(--color-stroke)] pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">List price</dt>
                <dd className="font-mono">{fmt(listUsdg, 2)} USDG</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">
                  Holder discount{tier?.label ? ` (${tier.label})` : ""}
                </dt>
                <dd className="font-mono text-[var(--color-live)]">−{pct}%</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--color-stroke)] pt-2">
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
              disabled={busy}
              className="btn-metal mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Reserving…" : "Reserve order — get payment details"}
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-muted)]">
              You send $INFINITY directly from your wallet. No approvals, the
              site never pulls tokens.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
              Send <span className="font-semibold text-[var(--color-white-soft)]">exactly</span> this
              amount on Robinhood Chain:
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
              onClick={submitTx}
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
        )}
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

function BucketIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 8h16l-1.6 11.2A2 2 0 0 1 16.4 21H7.6a2 2 0 0 1-2-1.8L4 8Z" />
      <path d="M8 8a4 4 0 0 1 8 0" strokeLinecap="round" />
    </svg>
  );
}
