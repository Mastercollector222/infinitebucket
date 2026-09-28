// Drop (/play) — shared types + the balance-tiered daily match cap.
// Client + server safe.

// Daily cap by live INFINITY balance (token units). balance 0 = demo mode
// (no career tracking). Everything is re-checked server-side.
export function playCap(balanceTokens: number): number {
  if (balanceTokens >= 10_000_000) return 15;
  if (balanceTokens >= 1_000_000) return 8;
  return 3;
}

export type PlayStats = {
  wins: number;
  games_played: number;
  remaining: number;
  cap: number;
};
