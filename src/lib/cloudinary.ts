import { v2 as cloudinary } from "cloudinary";

// Server-only Cloudinary client. The API secret never reaches the browser —
// this module is imported exclusively by route handlers.
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
  process.env;

export const cloudinaryReady = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET,
);

if (cloudinaryReady) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const AVATAR_MAX_BYTES = 1_048_576; // 1 MB
export const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

// Signed upload (api_secret signs automatically). public_id = wallet so a
// re-upload overwrites the previous avatar. If the configured upload preset
// doesn't exist on the cloud, retry without it rather than failing.
export async function uploadAvatar(
  wallet: string,
  dataUri: string,
): Promise<string> {
  const params = {
    folder: "avatars",
    public_id: wallet,
    overwrite: true,
    resource_type: "image" as const,
  };
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      ...params,
      upload_preset: preset || undefined,
    });
    return result.secure_url;
  } catch (e) {
    const msg = (e as { message?: string }).message ?? String(e);
    if (!preset || !/preset/i.test(msg)) throw e;
    const result = await cloudinary.uploader.upload(dataUri, params);
    return result.secure_url;
  }
}
