import { NextResponse } from "next/server";
import { badgeFor, LOUNGE_MIN, type LoungeMessage } from "@/lib/lounge";
import { loungeBalanceTokens } from "@/lib/loungeServer";
import { serviceSupabase, verifyWalletProof } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// GET /api/lounge/messages?after=<iso> — proof travels in headers so
// signatures never land in URLs/logs:
//   x-wallet, x-iso, x-signature  (the stored 24h login proof)
// The gate is a live balanceOf check — a 4.9M wallet cannot read history,
// and no anon SELECT policy exists on the table at all.
export async function GET(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Lounge storage is not configured.");

  const wallet = req.headers.get("x-wallet") ?? "";
  const iso = req.headers.get("x-iso") ?? "";
  const signature = req.headers.get("x-signature") ?? "";

  const signer = await verifyWalletProof(wallet, iso, signature);
  if (!signer) {
    return fail(401, "Invalid or stale wallet signature — sign in again.");
  }

  let tokens = 0;
  try {
    tokens = await loungeBalanceTokens(signer);
  } catch {
    return fail(502, "Could not read balance — try again.");
  }
  if (tokens < LOUNGE_MIN) {
    return fail(403, "Holders only — 5,000,000 $INFINITY required.");
  }

  const after = new URL(req.url).searchParams.get("after");
  let q = sb
    .from("lounge_messages")
    .select("id, wallet, body, created_at")
    .order("created_at", { ascending: Boolean(after) })
    .limit(100);
  if (after && Number.isFinite(Date.parse(after))) {
    q = q.gt("created_at", after);
  }
  const { data: rows, error } = await q;
  if (error) return fail(502, error.message);
  const messages = (rows ?? []).slice(0, 100);
  if (!after) messages.reverse(); // newest last for chat rendering

  // Join identities + compute badges from live balances (server-cached).
  const wallets = [...new Set(messages.map((m) => m.wallet as string))];
  const { data: users } = wallets.length
    ? await sb
        .from("users")
        .select("wallet, username, avatar_url")
        .in("wallet", wallets)
    : { data: [] };
  const userBy = new Map(
    (users ?? []).map((u) => [u.wallet as string, u]),
  );

  const bals = new Map<string, number>();
  await Promise.all(
    wallets.map(async (w) => {
      try {
        bals.set(w, await loungeBalanceTokens(w));
      } catch {
        /* badge omitted on RPC failure — message still renders */
      }
    }),
  );

  const out: LoungeMessage[] = messages.map((m) => {
    const u = userBy.get(m.wallet as string);
    const bal = bals.get(m.wallet as string);
    const badge = bal != null ? badgeFor(bal) : null;
    return {
      id: m.id as string,
      wallet: m.wallet as string,
      body: m.body as string,
      created_at: m.created_at as string,
      username: (u?.username as string | null) ?? null,
      avatar_url: (u?.avatar_url as string | null) ?? null,
      badge: badge ? { name: badge.name, color: badge.color } : null,
    };
  });

  return NextResponse.json({ ok: true, messages: out });
}
