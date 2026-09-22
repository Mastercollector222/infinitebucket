// Profile field validation for /profile. All rules are enforced client-side;
// the DB check constraint still guards username format.

export const BIO_MAX = 160;

// Reject anything that could inject a script scheme or a raw EVM address.
const BIO_BANNED = /javascript:|0x[a-fA-F0-9]{40}/i;

export type ProfileInput = {
  username: string;
  bio: string | null;
  x_url: string | null;
  telegram_url: string | null;
  website_url: string | null;
};

export function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

// Returns an error message, or null when valid. Empty input is valid (null).
export function checkBio(bio: string): string | null {
  const t = bio.trim();
  if (t === "") return null;
  if (t.length > BIO_MAX) return `Bio is ${t.length - BIO_MAX} characters over ${BIO_MAX}.`;
  if (BIO_BANNED.test(t)) return "Bio cannot contain links or wallet addresses.";
  return null;
}

export function checkXUrl(url: string): string | null {
  const t = url.trim();
  if (t === "") return null;
  if (!/^https:\/\/(x\.com|twitter\.com)\//.test(t)) {
    return "X link must start with https://x.com/ or https://twitter.com/";
  }
  return null;
}

export function checkTelegramUrl(url: string): string | null {
  const t = url.trim();
  if (t === "") return null;
  if (!t.startsWith("https://t.me/")) {
    return "Telegram link must start with https://t.me/";
  }
  return null;
}

export function checkWebsiteUrl(url: string): string | null {
  const t = url.trim();
  if (t === "") return null;
  if (!t.startsWith("https://")) {
    return "Website must start with https://";
  }
  return null;
}

// ── Server + render enforcement ──────────────────────────────────────────
// The checks above are UX hints; these are the security boundary. Social
// hosts are allowlisted; website_url allows any https host. Everything is
// scheme-checked so javascript:/data:/http: can never reach the DOM.
export const SOCIAL_HOSTS = {
  x: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"],
  telegram: ["t.me", "www.t.me"],
} as const;

// Returns a normalized https URL, or null when the input isn't https
// (or the host isn't allowed when hosts are given).
export function safeHttpsUrl(url: string, hosts?: readonly string[]): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    if (hosts && !hosts.includes(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const CLOUDINARY_PREFIX = "https://res.cloudinary.com/";

export function safeAvatarUrl(url: string | null | undefined): string | null {
  return url && url.startsWith(CLOUDINARY_PREFIX) ? url : null;
}
