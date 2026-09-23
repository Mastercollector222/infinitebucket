// Number + address formatting helpers. Keep display honest: never coerce
// missing data to 0 — callers should pass null/undefined for unknown values.

export function truncateAddress(addr?: string, size = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function formatUsd(value?: number | null, opts?: { compact?: boolean }): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (opts?.compact && abs >= 1000) {
    return `$${compact(value)}`;
  }
  // Small prices need more precision.
  const maxFrac = abs > 0 && abs < 1 ? 6 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  }).format(value);
}

// Short USD price for the header LIVE chip: >= 0.01 → 2–4 decimals,
// < 0.01 → exactly 8 decimals. Never more than 8 fractional digits and
// never scientific notation (Intl always expands it).
export function formatUsdPrice(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const tiny = Math.abs(value) < 0.01;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: tiny ? 8 : 2,
    maximumFractionDigits: tiny ? 8 : 4,
  }).format(value);
}

// Compact USD price for the $BUCKET header chip: >= 0.01 → 4 decimals,
// < 0.01 → up to 6 decimals. Never scientific notation.
export function formatUsdChip(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const tiny = Math.abs(value) < 0.01;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: tiny ? 2 : 4,
    maximumFractionDigits: tiny ? 6 : 4,
  }).format(value);
}

export function compact(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function timeAgo(iso?: string | number | null): string {
  if (iso == null) return "";
  const then = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
