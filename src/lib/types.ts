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

export type TokenStats = {
  holders: number | null;
  totalSupply: string | null;
  transfers: number | null;
  source: "blockscout" | null;
  updatedAt: number;
  ok: boolean;
  error?: string;
};
