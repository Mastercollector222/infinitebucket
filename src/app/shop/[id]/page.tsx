"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/AuthContext";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { useShopCart } from "@/hooks/useShopCart";
import { supabase } from "@/lib/supabase";
import { LINKS } from "@/lib/constants";
import {
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
  type CartLineFull,
} from "@/components/shop/Checkout";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export default function ProductPage() {
  const params = useParams();
  const id = Number(params.id);

  const { status, address, connect, verify } = useAuth();
  const { balance, raw: rawBalance, isLoading: balLoading } = useInfinityBalance();
  const { cart, cartCount, addToCart, setQty, saveCart } = useShopCart(address);

  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [tiers, setTiers] = useState<ShopTier[]>([]);
  const [ready, setReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [addressOrder, setAddressOrder] = useState<ShopOrder | null>(null);
  const [payOrder, setPayOrder] = useState<ShopOrder | null>(null);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("shop_products").select("*").order("sort"),
      supabase.from("shop_tiers").select("*").order("sort"),
    ]).then(([p, t]) => {
      const all = (p.data as ShopProduct[]) ?? [];
      setProducts(all);
      setProduct(all.find((x) => x.id === id) ?? null);
      setTiers((t.data as ShopTier[]) ?? []);
      setReady(true);
    });
  }, [id]);

  const connected = status === "ready" || status === "needs_username";
  const tier = connected && balance != null ? tierFor(balance, tiers) : null;
  const minReq = Number(product?.min_infinity_tokens) || 0;
  const gated = connected && balance != null && balance < minReq;
  const inCart = product ? (cart.find((l) => l.product_id === product.id)?.qty ?? 0) : 0;
  const canAdd =
    product != null && product.active && product.stock > inCart && connected &&
    !gated && (minReq === 0 || balance != null);

  const cartLines = useMemo(
    () =>
      cart
        .map((l) => ({ ...l, product: products.find((p) => p.id === l.product_id) }))
        .filter((l): l is CartLineFull => l.product != null),
    [cart, products],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-10 sm:px-6">
      <Link
        href="/shop"
        className="font-mono text-xs text-[var(--color-muted)] transition hover:text-[var(--color-chrome)]"
      >
        ← Back to shop
      </Link>

      {!ready ? (
        <div className="glass mt-6 h-96 animate-pulse" />
      ) : !product ? (
        <div className="glass mt-6 p-10 text-center text-sm text-[var(--color-muted)]">
          Product not found.
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Image */}
          <div className="glass relative aspect-square overflow-hidden">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <MetalDisc size="h-56 w-56" />
            )}
            {!product.active && (
              <span className="absolute left-4 top-4 rounded-full border border-[rgba(196,160,255,0.35)] bg-[rgba(10,6,16,0.75)] px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--color-chrome)] backdrop-blur">
                Coming soon
              </span>
            )}
          </div>

          {/* Info */}
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-4xl">
              {product.title}
            </h1>
            <p className="mt-3 font-mono text-2xl text-[var(--color-chrome)]">
              {fmt(product.price_usdg, 2)}{" "}
              <span className="text-sm text-[var(--color-muted)]">USDG</span>
            </p>

            {minReq > 0 && (
              <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Hold {fmt(minReq)} $INFINITY to buy
              </p>
            )}

            {product.description ? (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-[var(--color-muted)]">
                {product.description}
              </p>
            ) : product.blurb ? (
              <p className="mt-5 text-sm leading-relaxed text-[var(--color-muted)]">
                {product.blurb}
              </p>
            ) : null}

            {/* Balance vs requirement + discount */}
            <div className="glass mt-6 space-y-2 p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Your balance</span>
                <span className="font-mono text-[var(--color-chrome)]">
                  {connected
                    ? balLoading
                      ? "…"
                      : `${fmt(balance ?? 0)} INFINITY`
                    : "Connect wallet"}
                </span>
              </div>
              {minReq > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Required</span>
                  <span className="font-mono">{fmt(minReq)} INFINITY</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--color-stroke)] pt-2">
                <span className="text-[var(--color-muted)]">Your holder discount</span>
                <span className="font-mono text-[var(--color-live)]">
                  {tier?.percent ?? 0}% off
                  {tier?.label ? ` (${tier.label})` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Stock</span>
                <span className="font-mono">{product.stock}</span>
              </div>
            </div>

            {/* CTA */}
            {!connected ? (
              <button
                type="button"
                onClick={connect}
                className="btn-metal mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-semibold"
              >
                Connect to add
              </button>
            ) : gated ? (
              <div className="mt-6 space-y-2">
                <div className="rounded-xl border border-[rgba(196,160,255,0.3)] bg-[rgba(28,20,44,0.5)] px-4 py-3 text-center font-mono text-xs text-[var(--color-chrome)]">
                  Hold {fmt(minReq)} $INFINITY to add
                </div>
                <a
                  href={LINKS.trade}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-metal block rounded-xl px-4 py-3.5 text-center text-sm font-semibold"
                >
                  Buy $INFINITY
                </a>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canAdd}
                onClick={() => addToCart(product)}
                className="btn-metal mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {!product.active
                  ? "Coming soon"
                  : product.stock < 1
                    ? "Sold out"
                    : inCart > 0
                      ? `In cart ×${inCart} — add another`
                      : "Add to cart"}
              </button>
            )}

            <p className="mt-5 text-xs leading-relaxed text-[var(--color-muted)]">
              Merch paid in $INFINITY. Flat shipping: $6 in $INFINITY. Not an
              exchange. Not financial advice.
            </p>
          </div>
        </div>
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
            onClose={() => setCartOpen(false)}
            onPaid={() => saveCart([])}
            onDone={() => {
              setCartOpen(false);
              saveCart([]);
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
              setAddressOrder(o);
            }}
          />
        )}
        {addressOrder && address && (
          <AddressModal
            order={addressOrder}
            wallet={address}
            verify={verify}
            onClose={() => setAddressOrder(null)}
            onDone={() => setAddressOrder(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
