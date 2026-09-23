// InfiniteBucket immutable facts. Source of truth: AGENTS.md.
// Never invent values beyond what is defined here.

export const TOKEN = {
  name: "InfiniteBucket",
  symbol: "INFINITY",
  address: (process.env.NEXT_PUBLIC_TOKEN ||
    "0xbd305151d3d7eb612d3969e9fa05315cd47374e4") as `0x${string}`,
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

// Bucket Shop engine payout token + the keeper EOA that distributes it.
// Confirmed against live payout txs: direct BUCKET.transfer calls from this
// address to INFINITY holders. It is shared across launches — attribution to
// INFINITY is only valid when the wallet holds no other launch tokens.
export const BUCKET = {
  symbol: "BUCKET",
  address: "0xbc9E7b1c5C0081f4aE85e71eC95703d3dEC9ffaD" as `0x${string}`,
  decimals: 18,
} as const;

export const ENGINE_DISTRIBUTOR =
  "0x2ccc152ad68419f777531e6a40a52325e2a80ee2" as const;

// Deepest USDG-quoted BUCKET pool on Robinhood Chain (Uniswap v4, ~$635k
// liquidity) — used by /api/bucket for the header price chip.
export const BUCKET_POOL = {
  id: "0xf995afbcf406c641a5185ba2330cfef8ec0fd7502f06d638798c48e78e6e9dac" as const,
  network: "robinhood",
} as const;

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 4663;

export const CHAIN = {
  id: chainId,
  idHex: `0x${chainId.toString(16)}` as `0x${string}`,
  testnetId: 46630,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC ||
    "https://rpc.mainnet.chain.robinhood.com",
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
  dexscreener: `https://dexscreener.com/${POOL.network}/${POOL.id}`,
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
