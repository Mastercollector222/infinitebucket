import { NextResponse } from "next/server";
import {
  LOUNGE_MIN,
  LOUNGE_SEND_PER_HOUR,
  sanitizeLoungeBody,
} from "@/lib/lounge";
import {
  loungeBalanceTokens,
  verifyLoungeSession,
} from "@/lib/loungeServer";
import { rateLimit, serviceSupabase } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/lounge/send — { wallet, iso, signature, body }
// The signature is a lounge_session proof (30-minute window, chain-bound)
// — the client signs once, then reuses it across sends. The server
// re-verifies the live balance, mute status, and rate limit on every send
// before the service-role insert. Anon keys can never write
// lounge_messages — RLS has no policies for them.
export async function POST(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Lounge storage is not configured.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Expected JSON body.");
  }

  const { wallet, iso, signature } = body as {
    wallet?: string;
    iso?: string;
    signature?: string;
  };
  const clean = sanitizeLoungeBody(body.body);
  if (!wallet || !iso || !signature) {
    return fail(400, "Missing wallet proof.");
  }
  if (clean == null) {
    return fail(400, "Message must be 1–280 chars of plain text.");
  }

  // Lounge session signature — 30-minute freshness, chain-bound message.
  const signer = await verifyLoungeSession(wallet, iso, signature);
  if (!signer) {
    return fail(401, "Invalid or stale lounge signature — sign again.");
  }

  // Live on-chain gate — a posted balance is never trusted.
  let tokens = 0;
  try {
    tokens = await loungeBalanceTokens(signer);
  } catch {
    return fail(502, "Could not read balance — try again.");
  }
  if (tokens < LOUNGE_MIN) {
    return fail(403, "Holders only — 5,000,000 $INFINITY required.");
  }

  // Mute check — admin-set, expires automatically.
  const { data: mute } = await sb
    .from("lounge_mutes")
    .select("until")
    .eq("wallet", signer)
    .maybeSingle();
  if (mute?.until && Date.parse(mute.until) > Date.now()) {
    return fail(403, `Muted until ${new Date(mute.until).toUTCString()}.`);
  }

  if (!rateLimit(`lounge_send:${signer}`, LOUNGE_SEND_PER_HOUR)) {
    return fail(429, "Slow down — 20 messages per hour.");
  }

  const { data, error } = await sb
    .from("lounge_messages")
    .insert({ wallet: signer, body: clean })
    .select("id, created_at")
    .single();
  if (error) return fail(502, error.message);

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
}
