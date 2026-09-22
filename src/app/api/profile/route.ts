import { NextResponse } from "next/server";
import { rateLimit, serviceSupabase, verifyWalletProof } from "@/lib/shopServer";
import {
  BIO_MAX,
  checkBio,
  safeHttpsUrl,
  SOCIAL_HOSTS,
} from "@/lib/profile";
import { USERNAME_RE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const USER_SELECT =
  "wallet, username, avatar_url, bio, x_url, telegram_url, website_url, created_at, last_seen";

// POST /api/profile — the ONLY writer to public.users (anon has no write
// grants; service role used here after the signature check).
//   { action: "touch", wallet, iso, signature }   → login upsert + last_seen
//   { action: "save",  wallet, iso, signature, fields } → validated writes
export async function POST(req: Request) {
  const sb = serviceSupabase();
  if (!sb) return fail(503, "Account storage is not configured.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Expected JSON body.");
  }

  const { action, wallet, iso, signature } = body as {
    action?: string;
    wallet?: string;
    iso?: string;
    signature?: string;
  };
  if (!action || !wallet || !iso || !signature) {
    return fail(400, "Missing action or wallet proof.");
  }
  const signer = await verifyWalletProof(wallet, iso, signature);
  if (!signer) return fail(401, "Invalid or stale wallet signature — sign in again.");

  if (!rateLimit(`profile:${signer}`, 30)) {
    return fail(429, "Too many profile writes — try again later.");
  }

  // Login path: create the row if missing, bump last_seen. Never touches
  // username or profile fields.
  if (action === "touch") {
    const last_seen = new Date().toISOString();
    const { data: row } = await sb
      .from("users")
      .select(USER_SELECT)
      .eq("wallet", signer)
      .maybeSingle();
    if (row) {
      await sb.from("users").update({ last_seen }).eq("wallet", signer);
      return NextResponse.json({ ok: true, row: { ...row, last_seen } });
    }
    const { data: created, error: insErr } = await sb
      .from("users")
      .insert({ wallet: signer, last_seen })
      .select(USER_SELECT)
      .maybeSingle();
    if (insErr && insErr.code !== "23505") return fail(502, insErr.message);
    if (created) return NextResponse.json({ ok: true, row: created });
    // Insert raced another request — re-read.
    const { data: again } = await sb
      .from("users")
      .select(USER_SELECT)
      .eq("wallet", signer)
      .maybeSingle();
    return NextResponse.json({ ok: true, row: again });
  }

  // Profile write path: validated fields only, signer's own row.
  if (action === "save") {
    const f = (body.fields ?? {}) as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    if ("username" in f) {
      const u = typeof f.username === "string" ? f.username.trim() : "";
      if (!USERNAME_RE.test(u)) return fail(400, "Bad username format.");
      fields.username = u;
    }
    if ("bio" in f) {
      const b = typeof f.bio === "string" ? f.bio.trim() : "";
      const err = checkBio(b);
      if (err) return fail(400, err);
      fields.bio = b === "" ? null : b.slice(0, BIO_MAX);
    }
    if ("x_url" in f) {
      const v = typeof f.x_url === "string" ? f.x_url : "";
      fields.x_url = v.trim() === "" ? null : safeHttpsUrl(v, SOCIAL_HOSTS.x);
      if (v.trim() !== "" && fields.x_url == null) {
        return fail(400, "X link must be https://x.com/ or https://twitter.com/.");
      }
    }
    if ("telegram_url" in f) {
      const v = typeof f.telegram_url === "string" ? f.telegram_url : "";
      fields.telegram_url = v.trim() === "" ? null : safeHttpsUrl(v, SOCIAL_HOSTS.telegram);
      if (v.trim() !== "" && fields.telegram_url == null) {
        return fail(400, "Telegram link must be https://t.me/.");
      }
    }
    if ("website_url" in f) {
      const v = typeof f.website_url === "string" ? f.website_url : "";
      fields.website_url = v.trim() === "" ? null : safeHttpsUrl(v);
      if (v.trim() !== "" && fields.website_url == null) {
        return fail(400, "Website must be a valid https:// URL.");
      }
    }
    if (Object.keys(fields).length === 0) {
      return fail(400, "Nothing to save.");
    }

    const { data, error } = await sb
      .from("users")
      .upsert({ wallet: signer, ...fields }, { onConflict: "wallet" })
      .select(USER_SELECT)
      .maybeSingle();
    if (error) {
      return fail(
        error.code === "23505" ? 409 : 502,
        error.code === "23505" ? "That username is taken." : error.message,
      );
    }
    return NextResponse.json({ ok: true, row: data });
  }

  return fail(400, `Unknown action "${action}".`);
}
