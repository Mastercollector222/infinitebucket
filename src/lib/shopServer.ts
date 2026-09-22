// Server-only shop helpers. Never import from client components — this file
// reads SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getAddress, verifyMessage } from "viem";
import { actionMessage, loginMessage } from "./auth";
import { CHAIN, POOL, TOKEN } from "./constants";
import { isAdmin } from "./shop";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTION_TTL_MS = 10 * 60 * 1000; // action-bound proofs: 10 minutes
const FUTURE_SKEW_MS = 5 * 60 * 1000; // never accept signatures dated ahead

// Service-role client — the ONLY writer to shop_* + users tables. Server-side
// env only; it must never carry a NEXT_PUBLIC_ prefix or ship to the browser.
export function serviceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify a stored login proof: personal_sign over loginMessage(wallet, iso),
// inside the 24h session window and never future-dated. Returns the
// lowercase wallet or null.
export async function verifyWalletProof(
  wallet: string,
  iso: string,
  signature: string,
): Promise<string | null> {
  try {
    const checksum = getAddress(wallet);
    const signedAt = Date.parse(iso);
    if (!Number.isFinite(signedAt)) return null;
    const now = Date.now();
    if (signedAt > now + FUTURE_SKEW_MS) return null; // no future-dated proofs
    if (now - signedAt > SESSION_TTL_MS) return null;
    const ok = await verifyMessage({
      address: checksum,
      message: loginMessage(checksum, iso),
      signature: signature as `0x${string}`,
    });
    return ok ? checksum.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Verify an action-bound proof: personal_sign over
// actionMessage(action, wallet, orderId, iso). Required for payment marks
// and PII access — the 24h login session alone is never enough for those.
export async function verifyActionProof(
  wallet: string,
  iso: string,
  signature: string,
  action: string,
  orderId: number,
): Promise<string | null> {
  try {
    if (!Number.isInteger(orderId) || orderId <= 0) return null;
    const checksum = getAddress(wallet);
    const signedAt = Date.parse(iso);
    if (!Number.isFinite(signedAt)) return null;
    const now = Date.now();
    if (signedAt > now + FUTURE_SKEW_MS) return null;
    if (now - signedAt > ACTION_TTL_MS) return null;
    const ok = await verifyMessage({
      address: checksum,
      message: actionMessage(action, checksum, orderId, iso),
      signature: signature as `0x${string}`,
    });
    return ok ? checksum.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Per-key sliding-window rate limiter (in-memory — each serverless instance
// enforces its own share; enough to stop script spam).
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

// Verify the proof AND that the signer is in NEXT_PUBLIC_ADMIN_WALLETS.
export async function verifyAdmin(
  wallet: string,
  iso: string,
  signature: string,
): Promise<string | null> {
  const w = await verifyWalletProof(wallet, iso, signature);
  return w != null && isAdmin(w) ? w : null;
}

// ── INFINITY price in USDG (the pool's quote token) ──────────────────────
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { accept: "application/json;version=20230302" };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function shopPriceUsdg(): Promise<number | null> {
  try {
    const res = await fetch(
      `${GT_BASE}/networks/${POOL.network}/pools/${POOL.id}`,
      { headers: GT_HEADERS, next: { revalidate: 30 } },
    );
    if (res.ok) {
      const a = (await res.json())?.data?.attributes;
      const p = num(a?.base_token_price_quote_token) ?? num(a?.base_token_price_usd);
      if (p != null) return p;
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${TOKEN.address}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return null;
    const pairs: Array<Record<string, unknown>> = (await res.json())?.pairs ?? [];
    const pair =
      pairs.find((p) => {
        const cid = String(p.chainId ?? "").toLowerCase();
        const quote = String(
          (p.quoteToken as { symbol?: string })?.symbol ?? "",
        ).toUpperCase();
        return cid.includes("robinhood") && quote === "USDG";
      }) ??
      pairs.find((p) =>
        String(p.chainId ?? "").toLowerCase().includes("robinhood"),
      ) ??
      null;
    return pair ? num(pair.priceUsd) : null;
  } catch {
    return null;
  }
}

// Blockscout sits behind Cloudflare — realistic fingerprint or it 403s.
export const BS_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  referer: `${CHAIN.explorer}/`,
} as const;

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(CHAIN.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result as T;
}

// ── Shipping ─────────────────────────────────────────────────────────────

// Flat shipping in USDG, added to every order. Server-side env.
export function shippingUsdg(): number {
  const n = parseFloat(process.env.SHIPPING_USD ?? "");
  return Number.isFinite(n) && n >= 0 ? n : 6;
}

// AES-256-GCM at rest for shipment PII when SHIPPING_ENCRYPTION_KEY
// (32-byte hex) is set. Key never leaves this server — ciphertext goes to
// Postgres, plaintext only exists inside API request scope. Without the
// key, fields store plaintext (enc=false) behind RLS + service-role only.
function shipKey(): Buffer | null {
  const hex = (process.env.SHIPPING_ENCRYPTION_KEY ?? "").trim();
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
}

export function encField(plain: string): { value: string; enc: boolean } {
  const key = shipKey();
  if (!key || !plain) return { value: plain, enc: false };
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return {
    value: `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`,
    enc: true,
  };
}

export function decField(value: string, enc: boolean): string {
  if (!enc || !value.startsWith("v1:")) return value;
  const key = shipKey();
  if (!key) return "[encrypted]";
  try {
    const [, iv, tag, ct] = value.split(":");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      d.update(Buffer.from(ct, "base64")),
      d.final(),
    ]).toString("utf8");
  } catch {
    return "[encrypted]";
  }
}

const BALANCE_OF = "0x70a08231"; // balanceOf(address)

// Live INFINITY balance (wei-scale bigint) — the server never trusts a
// client-supplied balance when pricing an order.
export async function readBalanceRaw(wallet: string): Promise<bigint> {
  const hex = await rpc<string>("eth_call", [
    {
      to: TOKEN.address,
      data: BALANCE_OF + wallet.toLowerCase().slice(2).padStart(64, "0"),
    },
    "latest",
  ]);
  return BigInt(hex);
}

export type TxTransfer = {
  token: string;
  from: string;
  to: string;
  value: bigint;
};

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcLog = { address?: string; topics?: string[]; data?: string };

// Verify a payment ON-CHAIN via eth_getTransactionReceipt on chain 4663 —
// the node's receipt is the source of truth, never a third-party API.
// found=false → not mined yet; success=false → reverted.
export async function txReceiptTransfers(hash: string): Promise<{
  found: boolean;
  success: boolean;
  transfers: TxTransfer[];
}> {
  const receipt = await rpc<{
    status?: string;
    logs?: RpcLog[];
  } | null>("eth_getTransactionReceipt", [hash]);
  if (!receipt) return { found: false, success: false, transfers: [] };
  const transfers: TxTransfer[] = [];
  for (const log of receipt.logs ?? []) {
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC || topics.length < 3) continue;
    if (!log.address || typeof log.data !== "string") continue;
    try {
      transfers.push({
        token: log.address.toLowerCase(),
        from: `0x${topics[1].slice(26)}`.toLowerCase(),
        to: `0x${topics[2].slice(26)}`.toLowerCase(),
        value: BigInt(log.data),
      });
    } catch {
      /* skip malformed log */
    }
  }
  return { found: true, success: receipt.status === "0x1", transfers };
}
