import { NextResponse } from "next/server";
import {
  SHOP_IMAGE_MAX_BYTES,
  SHOP_IMAGE_MIME,
  cloudinaryReady,
  uploadShopImage,
} from "@/lib/cloudinary";
import { rateLimit, verifyAdmin } from "@/lib/shopServer";
import { SHOP_IMAGE_PREFIX } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/admin/shop/image — FormData: file, wallet, iso, signature,
// product_id (optional; "temp" for unsaved products).
// The signature is a loginMessage proof from a NEXT_PUBLIC_ADMIN_WALLETS
// address — recovered server-side before any upload happens.
export async function POST(req: Request) {
  if (!cloudinaryReady) {
    return fail(503, "Image uploads are not configured.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected multipart form data.");
  }

  const file = form.get("file");
  const wallet = form.get("wallet");
  const iso = form.get("iso");
  const signature = form.get("signature");

  if (
    !(file instanceof File) ||
    typeof wallet !== "string" ||
    typeof iso !== "string" ||
    typeof signature !== "string"
  ) {
    return fail(400, "Missing file or admin proof.");
  }

  const admin = await verifyAdmin(wallet, iso, signature);
  if (!admin) return fail(403, "Not an admin wallet (or stale signature).");

  if (!rateLimit(`admin_image:${admin}`, 30)) {
    return fail(429, "Too many uploads — try again later.");
  }

  // Images only — mime whitelist, svg can never pass.
  if (!(SHOP_IMAGE_MIME as readonly string[]).includes(file.type)) {
    return fail(415, "Only jpg, png, or webp images.");
  }
  if (file.size > SHOP_IMAGE_MAX_BYTES) {
    return fail(413, "Image must be 2 MB or smaller.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > SHOP_IMAGE_MAX_BYTES) {
    return fail(413, "Image must be 2 MB or smaller.");
  }

  // Folder name is sanitized — the id only scopes storage, never trusted.
  const pid =
    String(form.get("product_id") ?? "temp")
      .replace(/[^0-9a-zA-Z_-]/g, "")
      .slice(0, 40) || "temp";
  const publicId = `p${pid}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  let url: string;
  try {
    url = await uploadShopImage(
      `shop/${pid}`,
      publicId,
      `data:${file.type};base64,${buffer.toString("base64")}`,
    );
  } catch {
    // Never log provider response bodies.
    console.error("[shop image] cloudinary upload failed");
    return fail(502, "Cloudinary rejected the upload.");
  }

  if (!url.startsWith(SHOP_IMAGE_PREFIX)) {
    return fail(502, "Upload returned an unexpected URL.");
  }

  return NextResponse.json({ ok: true, url });
}
