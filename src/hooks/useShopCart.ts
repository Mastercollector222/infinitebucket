"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartLine, ShopProduct } from "@/lib/shop";

// Client cart persisted in localStorage per wallet (ib_cart_<address>).
// Server re-checks stock + per-item balance gates at order time — this is
// convenience state, never trusted.
export function useShopCart(wallet: string | undefined) {
  const key = wallet ? `ib_cart_${wallet.toLowerCase()}` : null;
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    if (!key) {
      setCart([]);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
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
  }, [key]);

  const saveCart = useCallback(
    (next: CartLine[]) => {
      setCart(next);
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
      }
    },
    [key],
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

  const cartCount = useMemo(() => cart.reduce((n, l) => n + l.qty, 0), [cart]);

  return { cart, cartCount, addToCart, setQty, saveCart };
}
