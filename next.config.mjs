import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

// Origins the browser legitimately talks to (connect-src). Everything else
// is same-origin — external APIs are only ever hit by server code.
const rpcOrigin = (() => {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_RPC ?? "https://rpc.mainnet.chain.robinhood.com",
    ).origin;
  } catch {
    return "https://rpc.mainnet.chain.robinhood.com";
  }
})();
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin || null;
  } catch {
    return null;
  }
})();

// WalletConnect + Coinbase Wallet endpoints — required for the multi-wallet
// connect modal. Only loosened when a project id is configured; the
// injected-only build keeps the tight CSP.
const wcEnabled = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_ID?.trim());
const wcConnectSrc = wcEnabled
  ? [
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
      "https://*.web3modal.com",
      "https://*.web3modal.org",
      "wss://*.web3modal.org",
      "https://rpc.walletconnect.com",
      "https://rpc.walletconnect.org",
      "https://keys.coinbase.com",
      "https://*.wallet.coinbase.com",
      "https://cca-lite.coinbase.com",
    ]
  : [];
const wcImgSrc = wcEnabled
  ? [
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "https://*.web3modal.com",
      "https://*.web3modal.org",
    ]
  : [];
// The WC Verify pane renders as an iframe inside the connect modal.
const wcFrameSrc = wcEnabled
  ? [
      "https://verify.walletconnect.org",
      "https://verify.walletconnect.com",
      "https://secure.walletconnect.org",
      "https://secure.walletconnect.com",
      "https://secure-mobile.walletconnect.com",
      "https://keys.coinbase.com",
    ]
  : [];

const connectSrc = [
  "'self'",
  rpcOrigin,
  supabaseOrigin,
  "https://launch.bucketmarkets.com", // giveaway indexer (browser fallback)
  "https://robinhoodchain.blockscout.com",
  ...wcConnectSrc,
]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' https://res.cloudinary.com data:${wcImgSrc.length ? ` ${wcImgSrc.join(" ")}` : ""}`,
  `connect-src ${connectSrc}`,
  "font-src 'self' data:",
  `frame-src 'self'${wcFrameSrc.length ? ` ${wcFrameSrc.join(" ")}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// /game/* documents are framed by our own /play page — allow self-framing
// only. Every other header (including CSP contents) stays identical.
const gameCsp = csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'");
const gameHeaders = securityHeaders.map((h) =>
  h.key === "Content-Security-Policy"
    ? { key: h.key, value: gameCsp }
    : h.key === "X-Frame-Options"
      ? { key: h.key, value: "SAMEORIGIN" }
      : h,
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Last matching rule wins per header key — /game/* overrides below.
      { source: "/game/:path*", headers: gameHeaders },
    ];
  },
  webpack: (config) => {
    // wagmi / walletconnect optional native deps that must be ignored on web
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional React Native storage dep referenced by @metamask/sdk on web.
    config.resolve = config.resolve || {};
    // Ensure the "@/*" alias and TS(X) extensions resolve reliably.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(import.meta.dirname, "src"),
      // Optional x402 payment submodules pulled in transitively by the Base
      // Account connector (via @coinbase/cdp-sdk). Unused here — stub them.
      "@x402/evm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/svm/exact/client": false,
      "@x402/core/client": false,
      "@react-native-async-storage/async-storage": false,
    };
    const exts = config.resolve.extensions || [];
    for (const e of [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"]) {
      if (!exts.includes(e)) exts.push(e);
    }
    config.resolve.extensions = exts;
    return config;
  },
};

export default nextConfig;
