// Infinite Bucket Shop — shared types + math used by the storefront,
// admin page, and API routes.
import { TOKEN } from "./constants";

export const SHOP_WALLET = (
  process.env.NEXT_PUBLIC_SHOP_WALLET || ""
).toLowerCase();

// Comma-separated lowercase addresses. Public by design — the signature
// check in /api/admin/shop is the gate, the list only drives the UI.
export function adminWallets(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_WALLETS || "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^0x[0-9a-f]{40}$/.test(w));
}

export function isAdmin(wallet?: string | null): boolean {
  return wallet != null && adminWallets().includes(wallet.toLowerCase());
}

export const DEFAULT_MIN_TOKENS = 1_000_000;

export type ShopTier = {
  id: number;
  min_tokens: number;
  percent: number;
  label: string;
  sort: number;
};

export type ShopProduct = {
  id: number;
  title: string;
  blurb: string;
  image_url: string | null;
  price_usdg: number;
  stock: number;
  active: boolean;
  sort: number;
};

export type ShopOrderStatus =
  | "awaiting_tx"
  | "paid_pending_ship"
  | "shipped"
  | "cancelled";

export type ShopOrder = {
  id: number;
  wallet: string;
  product_id: number;
  qty: number;
  price_usdg: number;
  discount_pct: number;
  usdg_due: number;
  infinity_raw_due: string; // wei-scale bigint as text
  status: ShopOrderStatus;
  tx_hash: string | null;
  tracking_note: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  shop_products?: { title: string } | null;
};

// Highest tier the balance qualifies for. Tiers need not be sorted.
export function tierFor(balance: number, tiers: ShopTier[]): ShopTier | null {
  let best: ShopTier | null = null;
  for (const t of tiers) {
    if (balance >= t.min_tokens && (best == null || t.min_tokens > best.min_tokens)) {
      best = t;
    }
  }
  return best;
}

// Discounted USDG due for qty units at a given tier percent.
export function usdgDue(priceUsdg: number, qty: number, pct: number): number {
  return priceUsdg * qty * (1 - pct / 100);
}

// Convert a USDG total to the exact INFINITY amount (wei-scale bigint),
// rounding UP so fp error can never produce an underpayment.
// priceUsdgPerInfinity = INFINITY price denominated in USDG (≈ priceUsd
// since the pool quotes in USDG).
export function infinityDueRaw(
  usdgTotal: number,
  priceUsdgPerInfinity: number,
): bigint {
  if (!(priceUsdgPerInfinity > 0)) return 0n;
  const units = (usdgTotal / priceUsdgPerInfinity) * 10 ** TOKEN.decimals;
  return BigInt(Math.ceil(units));
}

export function formatInfinityRaw(raw: string): string {
  const n = Number(BigInt(raw) / 10n ** BigInt(TOKEN.decimals));
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Exact wei-scale value → decimal token string (what a wallet's Send form
// expects), trailing zeros trimmed. Never round this — underpaying fails
// verification.
export function rawToDecimalString(raw: string): string {
  const base = 10n ** BigInt(TOKEN.decimals);
  const whole = BigInt(raw) / base;
  const frac = (BigInt(raw) % base).toString().padStart(TOKEN.decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
