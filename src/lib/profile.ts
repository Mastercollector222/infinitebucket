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
