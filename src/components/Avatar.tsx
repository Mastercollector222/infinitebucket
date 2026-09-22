import { safeAvatarUrl } from "@/lib/profile";

// Wallet avatar: Cloudinary image when set, else a deterministic blockie-like
// fallback — hue derived from the wallet, first letter of the username (or
// address) inside. Non-Cloudinary URLs never render — no tracking pixels.
export function Avatar({
  url,
  wallet,
  username,
  size,
}: {
  url?: string | null;
  wallet?: string | null;
  username?: string | null;
  size: number;
}) {
  const src = safeAvatarUrl(url);
  const seed = (wallet ?? username ?? "?").toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const letter = (username?.[0] ?? wallet?.slice(2, 3) ?? "?").toUpperCase();

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={username ?? "avatar"}
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-[var(--color-stroke)] object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--color-stroke)] font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${hue} 55% 38%), hsl(${(hue + 40) % 360} 65% 22%))`,
      }}
    >
      {letter}
    </span>
  );
}
