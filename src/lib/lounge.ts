// Holders Lounge — shared constants, badge tiers, and message types.
// Client + server safe (no secrets).

export const LOUNGE_MIN = 5_000_000; // $INFINITY (human units) to enter
export const LOUNGE_MAX_BODY = 280;
export const LOUNGE_SEND_PER_HOUR = 20;
// One lounge_session signature authorizes sends for 30 minutes — a middle
// ground between a 24h bearer session (too long to post as someone) and a
// per-message popup (unusable chat).
export const LOUNGE_SESSION_TTL_MS = 30 * 60 * 1000;

export type LoungeBadge = { name: string; color: string; min: number };

// Highest tier only — computed exclusively from live balanceOf, never
// stored. Obsidian is dark glass, the rest are metal tones.
export const LOUNGE_BADGES: LoungeBadge[] = [
  { min: 100_000_000, name: "Obsidian", color: "#3a3350" },
  { min: 60_000_000, name: "Amethyst", color: "#a78bfa" },
  { min: 30_000_000, name: "Gold", color: "#d4af37" },
  { min: 15_000_000, name: "Silver", color: "#c7c9d1" },
  { min: 10_000_000, name: "Copper", color: "#b87333" },
  { min: 5_000_000, name: "Seat", color: "#7a6f8c" },
];

export function badgeFor(balanceTokens: number): LoungeBadge | null {
  return LOUNGE_BADGES.find((b) => balanceTokens >= b.min) ?? null;
}

export type LoungeBadgeWire = { name: string; color: string } | null;
export type LoungeMute = { wallet: string; until: string };

export type LoungeMessage = {
  id: string;
  wallet: string;
  body: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
  badge: LoungeBadgeWire;
};

// Sanitize message text: strip tags/markup chars, reject dangerous schemes
// outright, enforce 1–280 chars. Returns the clean body or null.
// The client sends the ALREADY-sanitized text — the server re-runs this
// and hashes the result, so the signature binds the stored content.
export function sanitizeLoungeBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/<[^>]*>?/g, "").replace(/[<>]/g, "");
  const body = stripped.trim();
  if (body.length < 1 || body.length > LOUNGE_MAX_BODY) return null;
  if (/javascript\s*:|data\s*:|vbscript\s*:/i.test(body)) return null;
  return body;
}
