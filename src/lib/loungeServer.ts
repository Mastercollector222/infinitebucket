// Server-only lounge helpers — live balance cache + session-bound send
// proof. Never import from client components (touches service-role paths).
import { getAddress, verifyMessage, formatUnits } from "viem";
import { loungeSessionMessage } from "./auth";
import { TOKEN } from "./constants";
import { LOUNGE_SESSION_TTL_MS } from "./lounge";
import { readBalanceRaw } from "./shopServer";

const BAL_CACHE_MS = 30_000; // live enough for gates/badges, kind to the RPC
const balCache = new Map<string, { tokens: number; ts: number }>();

// Live INFINITY balance in token units via eth_call balanceOf on 4663 —
// never a client-supplied value. 30s in-memory cache per wallet.
export async function loungeBalanceTokens(wallet: string): Promise<number> {
  const w = wallet.toLowerCase();
  const hit = balCache.get(w);
  if (hit && Date.now() - hit.ts < BAL_CACHE_MS) return hit.tokens;
  const raw = await readBalanceRaw(w);
  const tokens = Number(formatUnits(raw, TOKEN.decimals));
  balCache.set(w, { tokens, ts: Date.now() });
  if (balCache.size > 5_000) balCache.clear();
  return tokens;
}

// Verify a lounge_session proof: personal_sign over
// loungeSessionMessage(wallet, iso) — recovered signer must be the claimed
// wallet, the signature must be ≤30 minutes old, and never future-dated.
export async function verifyLoungeSession(
  wallet: string,
  iso: string,
  signature: string,
): Promise<string | null> {
  try {
    const checksum = getAddress(wallet);
    const signedAt = Date.parse(iso);
    if (!Number.isFinite(signedAt)) return null;
    const now = Date.now();
    if (signedAt > now + 5 * 60 * 1000) return null; // no future-dating
    if (now - signedAt > LOUNGE_SESSION_TTL_MS) return null;
    const ok = await verifyMessage({
      address: checksum,
      message: loungeSessionMessage(checksum, iso),
      signature: signature as `0x${string}`,
    });
    return ok ? checksum.toLowerCase() : null;
  } catch {
    return null;
  }
}
