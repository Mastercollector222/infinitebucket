// Server-only lounge helpers — live balance cache + content-bound send
// proof. Never import from client components (touches service-role paths).
import { createHash } from "crypto";
import { getAddress, verifyMessage } from "viem";
import { formatUnits } from "viem";
import { loungeSendMessage } from "./auth";
import { TOKEN } from "./constants";
import { LOUNGE_SIGN_TTL_MS } from "./lounge";
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

export function sha256Hex(text: string): string {
  return `0x${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// Verify a lounge_send proof: personal_sign over
// loungeSendMessage(wallet, sha256(body), iso) — recovered signer must be
// the claimed wallet and the signature must be within 5 minutes either way.
// The message itself carries "Chain: 4663" — equality check binds it.
export async function verifyLoungeSend(
  wallet: string,
  iso: string,
  signature: string,
  body: string,
): Promise<string | null> {
  try {
    const checksum = getAddress(wallet);
    const signedAt = Date.parse(iso);
    if (!Number.isFinite(signedAt)) return null;
    if (Math.abs(Date.now() - signedAt) > LOUNGE_SIGN_TTL_MS) return null;
    const ok = await verifyMessage({
      address: checksum,
      message: loungeSendMessage(checksum, sha256Hex(body), iso),
      signature: signature as `0x${string}`,
    });
    return ok ? checksum.toLowerCase() : null;
  } catch {
    return null;
  }
}
