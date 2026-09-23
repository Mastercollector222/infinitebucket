// Normalized shapes returned by our API route handlers. The client never
// talks to third-party APIs directly (avoids CORS + keeps a single contract).

export type Trade = {
  id: string;
  side: "buy" | "sell";
  priceUsd: number | null;
  amountUsd: number | null;
  timestamp: number; // ms epoch
  txUrl?: string;
};

export type MarketData = {
  priceUsd: number | null;
  change24h: number | null; // percent
  volume24h: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  txns24h: number | null;
  name: string | null;
  source: "geckoterminal" | "dexscreener" | null;
  updatedAt: number; // ms epoch when fetched
};

export type MarketResponse = {
  data: MarketData;
  trades: Trade[];
  ok: boolean;
  error?: string;
};

export type BucketQuote = {
  ok: boolean;
  priceUsd: number | null;
  change24h: number | null; // percent
  error?: string;
};

export type EngineStats = {
  // INFINITY bought back and burned by the engine (token units, ongoing).
  burnedInfinity: number | null;
  // INFINITY burned once at graduation (unsold bonding-curve supply).
  burnedAtGraduation: number | null;
  // Total INFINITY destroyed = launch supply - current supply.
  burnedTotal: number | null;
  // Current on-chain total supply (token units).
  supplyNow: number | null;
  // Fees routed to this token's holder leg, USDG-denominated (per-token).
  paidToHoldersTokenUsd: number | null;
  // INFINITY tokens routed to the holder leg (converted to BUCKET on payout).
  infinityToHolders: number | null;
  // Bucket Shop engine lifetime payouts to holders, USD (engine-wide total).
  paidToHoldersUsd: number | null;
  // USD currently processed/held by the engine (engine-wide).
  engineUsd: number | null;
  // This token's pending jar (USD) awaiting the next payday.
  jarUsd: number | null;
  lastPaydayTs: number | null; // seconds epoch
  status: string | null;
  stalled: boolean;
  source: "bucketshop" | null;
  updatedAt: number;
  ok: boolean;
  error?: string;
};

export type TokenStats = {
  holders: number | null;
  totalSupply: string | null;
  transfers: number | null;
  source: "blockscout" | null;
  updatedAt: number;
  ok: boolean;
  error?: string;
};
