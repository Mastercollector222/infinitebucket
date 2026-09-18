import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAddress, verifyMessage } from "viem";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  cloudinaryReady,
  uploadAvatar,
} from "@/lib/cloudinary";
import { avatarMessage } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_TTL_MS = 10 * 60 * 1000; // upload proof is fresh for 10 min

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
  // wallet A from writing wallet B's row or public_id.
  let wallet: string;
  try {
    const checksum = getAddress(address);
    const ok = await verifyMessage({
      address: checksum,
      message: avatarMessage(checksum, iso),
      signature: signature as `0x${string}`,
    });
    if (!ok) return fail(401, "Signature did not match this wallet.");
    wallet = checksum.toLowerCase();
  } catch {
    return fail(401, "Invalid wallet proof.");
  }

  const signedAt = Date.parse(iso);
  if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > SIGNATURE_TTL_MS) {
    return fail(401, "Signature is stale — sign again.");
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
    return fail(502, "Upload to Cloudinary failed.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return fail(503, "Account storage is not configured.");
  }
  const supabase = createClient(url, anonKey);

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
