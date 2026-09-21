// Server-only shop helpers. Never import from client components — this file
// reads SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAddress, verifyMessage } from "viem";
import { loginMessage } from "./auth";
import { CHAIN, POOL, TOKEN } from "./constants";
import { isAdmin } from "./shop";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Service-role client — the ONLY writer to shop_* tables. Server-side env
// only; it must never carry a NEXT_PUBLIC_ prefix or ship to the browser.
export function serviceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify a stored login proof: personal_sign over loginMessage(wallet, iso),
// still inside the 24h session window. Returns the lowercase wallet or null.
export async function verifyWalletProof(
  wallet: string,
  iso: string,
  signature: string,
): Promise<string | null> {
  try {
    const checksum = getAddress(wallet);
    const signedAt = Date.parse(iso);
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > SESSION_TTL_MS) {
      return null;
    }
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

// ERC-20 transfers contained in a tx, per Blockscout. Tries the inline
// token_transfers field first, then the dedicated endpoint.
export async function txTransfers(hash: string): Promise<{
  ok: boolean;
  status: string | null;
  transfers: TxTransfer[];
}> {
  const parse = (rows: unknown[]): TxTransfer[] =>
    rows
      .map((r) => {
        const t = r as Record<string, unknown>;
        const token = t.token as { address_hash?: string; address?: string } | undefined;
        const from = t.from as { hash?: string } | undefined;
        const to = t.to as { hash?: string } | undefined;
        const total = t.total as { value?: string } | undefined;
        const tokenAddr = token?.address_hash ?? token?.address;
        const value = total?.value ?? (t.value as string | undefined);
        if (!tokenAddr || !from?.hash || !to?.hash || value == null) return null;
        try {
          return {
            token: tokenAddr.toLowerCase(),
            from: from.hash.toLowerCase(),
            to: to.hash.toLowerCase(),
            value: BigInt(value),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is TxTransfer => x !== null);

  const res = await fetch(`${CHAIN.explorer}/api/v2/transactions/${hash}`, {
    headers: BS_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, status: null, transfers: [] };
  const j = (await res.json()) as Record<string, unknown>;
  const status = typeof j.status === "string" ? j.status.toLowerCase() : null;
  let rows = (j.token_transfers as unknown[] | undefined) ?? [];

  if (rows.length === 0) {
    try {
      const r2 = await fetch(
        `${CHAIN.explorer}/api/v2/transactions/${hash}/token-transfers`,
        { headers: BS_HEADERS, cache: "no-store" },
      );
      if (r2.ok) {
        const j2 = (await r2.json()) as { items?: unknown[] };
        rows = j2.items ?? [];
      }
    } catch {
      /* keep empty */
    }
  }
  return { ok: true, status, transfers: parse(rows) };
}
