// InfiniteBucket immutable facts. Source of truth: AGENTS.md.
// Never invent values beyond what is defined here.

export const TOKEN = {
  name: "InfiniteBucket",
  symbol: "INFINITY",
  address: "0xbd305151d3d7eb612d3969e9fa05315cd47374e4" as const,
  decimals: 18,
  totalSupply: 1_000_000_000, // fixed, 1B
  standard: "ERC-20",
} as const;

export const QUOTE = {
  symbol: "USDG",
  name: "Global Dollar (Paxos)",
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const,
  decimals: 6, // NEVER treat as 18
} as const;

export const CHAIN = {
  id: 4663,
  idHex: "0x1237",
  testnetId: 46630,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

export const POOL = {
  // Uniswap v4 INFINITY/USDG pool id used by GeckoTerminal
  id: "0xa87610e3cb4f3d9c5373b73d51863d38a9e37a66a09143cf6520b6e177e75abd" as const,
  network: "robinhood",
  poolManager: "0x8366a39cc670b4001A1121B8F6A443A643e40951" as const,
} as const;

export const LINKS = {
  // Primary Buy CTA → Uniswap swap on Robinhood Chain (USDG → INFINITY).
  trade: `https://app.uniswap.org/swap?chain=${POOL.network}&inputCurrency=${QUOTE.address}&outputCurrency=${TOKEN.address}`,
  launch: `https://launch.bucketmarkets.com/#t/${TOKEN.address}`,
  geckoterminal: `https://www.geckoterminal.com/${POOL.network}/pools/${POOL.id}`,
  robinscanner: `https://robinscanner.com/tokens/${TOKEN.address}`,
  blockscoutToken: `${CHAIN.explorer}/token/${TOKEN.address}`,
} as const;

// Social links. Env vars override; defaults below are the official channels.
// Empty string renders a "coming soon" slot instead of a dead link.
export const SOCIALS = {
  x: process.env.NEXT_PUBLIC_X_URL || "https://x.com/InfinityBucket_",
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/InfiniteBucket",
} as const;

export const REFRESH_MS = 15_000;

// Canonical site URL for metadata / OG / watchAsset image. Override per env.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://infinitebucket.net";
