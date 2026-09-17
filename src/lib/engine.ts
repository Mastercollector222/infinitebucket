import { TOKEN, QUOTE } from "./constants";
import type { EngineStats } from "./types";

// Bucket Shop launchpad indexer — the same source the official launch page
// reads. CORS is open (Access-Control-Allow-Origin: *), so browsers can call it
// directly when a server proxy can't reach it.
export const IX = "https://launch.bucketmarkets.com/ix/launchpad";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export function emptyEngine(error?: string): EngineStats {
  return {
    burnedInfinity: null,
    burnedAtGraduation: null,
    burnedTotal: null,
    supplyNow: null,
    paidToHoldersTokenUsd: null,
    infinityToHolders: null,
    paidToHoldersUsd: null,
    engineUsd: null,
    jarUsd: null,
    lastPaydayTs: null,
    status: null,
    stalled: false,
    source: null,
    updatedAt: Date.now(),
    ok: false,
    error,
  };
}

// Normalize the indexer's payouts + launch records into EngineStats.
export function parseEngineStats(
  payouts: Record<string, any> | null,
  launch: Record<string, any> | null,
): EngineStats {
  if (!payouts) return emptyEngine("payouts unavailable");

  const addr = TOKEN.address.toLowerCase();
  const life = payouts.life ?? {};
  const tok = payouts.tokens?.[addr] ?? {};

  // Engine buy-back-and-burn: raw base units (18 decimals).
  const engineBurned = (() => {
    const v = num(life.burned?.[addr]);
    return v != null ? v / 1e18 : null;
  })();

  // Current supply from the launch record (matches on-chain totalSupply).
  const supplyNow = (() => {
    const v = num(launch?.totalSupply);
    return v != null ? v / 1e18 : null;
  })();

  const burnedTotal = supplyNow != null ? TOKEN.totalSupply - supplyNow : null;
  const burnedAtGraduation =
    burnedTotal != null && engineBurned != null ? burnedTotal - engineBurned : null;

  // Per-token fees routed to the holder leg. USDG legs are 6 decimals;
  // the INFINITY leg is 18.
  const income = launch?.income;
  const poolFees = income?.pool ?? {};
  const usdgToHolders =
    (num(income?.curve?.toHolders) ?? 0) +
    (num(poolFees?.[QUOTE.address.toLowerCase()]?.toHolders) ?? 0);
  const infinityToHoldersRaw = num(poolFees?.[addr]?.toHolders);

  return {
    burnedInfinity: engineBurned,
    burnedAtGraduation,
    burnedTotal,
    supplyNow,
    paidToHoldersTokenUsd: usdgToHolders > 0 ? usdgToHolders / 1e6 : null,
    infinityToHolders: infinityToHoldersRaw != null ? infinityToHoldersRaw / 1e18 : null,
    paidToHoldersUsd: num(life.paid_usd),
    engineUsd: num(life.engine_usd),
    jarUsd: num(tok.jar_usd),
    lastPaydayTs: num(tok.last_payday_ts),
    status: typeof payouts.status === "string" ? payouts.status : null,
    stalled: Boolean(payouts.stalled),
    source: "bucketshop",
    updatedAt: Date.now(),
    ok: true,
  };
}

// Find our token's launch record in the paginated launches list.
export async function findLaunchRecord(
  fetcher: (url: string) => Promise<Record<string, any>>,
): Promise<Record<string, any> | null> {
  const addr = TOKEN.address.toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const j = await fetcher(`${IX}/launches${page > 1 ? `?page=${page}` : ""}`);
    const arr: Record<string, any>[] = Array.isArray(j)
      ? j
      : j.items ?? j.launches ?? j.data ?? Object.values(j);
    const rec = arr.find(
      (x) => typeof x?.token === "string" && x.token.toLowerCase() === addr,
    );
    if (rec) return rec;
    if (!Array.isArray(arr) || arr.length === 0) break;
  }
  return null;
}

// Direct client-side fetch (browser → indexer, CORS-open). Used when the
// server proxy can't reach the indexer (e.g. datacenter IP blocks).
export async function fetchEngineDirect(): Promise<EngineStats> {
  const get = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  };
  const [payouts, launch] = await Promise.all([
    get(`${IX}/payouts`).catch(() => null),
    findLaunchRecord(get).catch(() => null),
  ]);
  return parseEngineStats(payouts, launch);
}
