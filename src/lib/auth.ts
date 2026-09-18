// Wallet-only auth: prove address ownership with a personal_sign, store the
// session in localStorage, and re-verify once it is older than 24h.

export const SESSION_KEY = "ib_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export type Session = {
  wallet: string; // lowercase address
  username: string | null;
  verifiedAt: number; // ms epoch of last verified signature
};

// The message the wallet signs. Timestamped so signatures can't be replayed
// as fresh forever.
export function loginMessage(address: string, iso: string): string {
  return `Infinite Bucket login\nAddress: ${address}\nAt: ${iso}`;
}

// Separate proof for avatar uploads — the API route verifies this before
// touching Cloudinary or the users row, so only the wallet owner can write.
export function avatarMessage(address: string, iso: string): string {
  return `Infinite Bucket avatar upload\nAddress: ${address}\nAt: ${iso}`;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (typeof s.wallet !== "string" || typeof s.verifiedAt !== "number") {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function sessionFresh(s: Session | null): boolean {
  return s != null && Date.now() - s.verifiedAt < SESSION_TTL_MS;
}
