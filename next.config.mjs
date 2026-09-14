import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
