import { NextResponse } from "next/server";
import { getAddress, verifyMessage } from "viem";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  cloudinaryReady,
  uploadAvatar,
} from "@/lib/cloudinary";
import { avatarMessage, loginMessage } from "@/lib/auth";
import { CLOUDINARY_PREFIX } from "@/lib/profile";
import { rateLimit, serviceSupabase } from "@/lib/shopServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_TTL_MS = 10 * 60 * 1000; // dedicated upload proof: 10 min
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // reused login proof: session lifetime

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/avatar — FormData: file, address, iso, signature.
// The signature over `avatarMessage(address, iso)` proves wallet ownership;
// the DB write and Cloudinary public_id are keyed to the recovered signer.
export async function POST(req: Request) {
  if (!cloudinaryReady) {
    return fail(503, "Avatar uploads are not configured.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected multipart form data.");
  }

  const file = form.get("file");
  const address = form.get("address");
  const iso = form.get("iso");
  const signature = form.get("signature");

  if (!(file instanceof File) || typeof address !== "string" || typeof iso !== "string" || typeof signature !== "string") {
    return fail(400, "Missing file or wallet proof.");
  }

  // Verify the upload proof before touching storage — this is what stops
  // wallet A from writing wallet B's row or public_id. Accepts a dedicated
  // avatar proof (10 min) or the stored login proof (session lifetime, 24h).
  let wallet: string;
  let kind: "avatar" | "login";
  try {
    const checksum = getAddress(address);
    const sig = signature as `0x${string}`;
    if (
      await verifyMessage({
        address: checksum,
        message: avatarMessage(checksum, iso),
        signature: sig,
      })
    ) {
      kind = "avatar";
    } else if (
      await verifyMessage({
        address: checksum,
        message: loginMessage(checksum, iso),
        signature: sig,
      })
    ) {
      kind = "login";
    } else {
      return fail(401, "Signature did not match this wallet.");
    }
    wallet = checksum.toLowerCase();
  } catch {
    return fail(401, "Invalid wallet proof.");
  }

  const signedAt = Date.parse(iso);
  const ttl = kind === "avatar" ? SIGNATURE_TTL_MS : SESSION_TTL_MS;
  if (
    !Number.isFinite(signedAt) ||
    signedAt > Date.now() + 5 * 60 * 1000 || // never future-dated
    Date.now() - signedAt > ttl
  ) {
    return fail(401, "Signature is stale — sign again.");
  }

  if (!rateLimit(`avatar:${wallet}`, 10)) {
    return fail(429, "Too many uploads — try again later.");
  }

  // Images only, never svg — mime whitelist, not extension trust.
  if (!(AVATAR_MIME as readonly string[]).includes(file.type)) {
    return fail(415, "Only jpg, png, or webp images.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return fail(413, "Avatar must be 1 MB or smaller.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > AVATAR_MAX_BYTES) {
    return fail(413, "Avatar must be 1 MB or smaller.");
  }

  let avatar_url: string;
  try {
    avatar_url = await uploadAvatar(
      wallet,
      `data:${file.type};base64,${buffer.toString("base64")}`,
    );
  } catch {
    // Never log provider response bodies — fixed string only.
    console.error("[avatar] cloudinary upload failed");
    return fail(502, "Cloudinary rejected the upload.");
  }
  if (!avatar_url.startsWith(CLOUDINARY_PREFIX)) {
    return fail(502, "Upload returned an unexpected URL.");
  }

  const supabase = serviceSupabase();
  if (!supabase) {
    return fail(503, "Account storage is not configured.");
  }

  // Update the signer's own row only — verified wallet, lowercase PK.
  const { error } = await supabase
    .from("users")
    .update({ avatar_url })
    .eq("wallet", wallet);

  if (error) {
    return fail(502, `Could not save avatar: ${error.message}`);
  }

  return NextResponse.json({ ok: true, avatar_url });
}
