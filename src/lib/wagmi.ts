import { createConfig, http } from "wagmi";
import { getDefaultConfig } from "connectkit";
import { robinhoodChain } from "./chain";
import { SITE_URL } from "./constants";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

// Single-chain config: Robinhood Chain only (AGENTS.md hard ban on other chains).
export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "InfiniteBucket",
    appDescription: "$INFINITY on Robinhood Chain.",
    appUrl: SITE_URL,
    walletConnectProjectId: projectId,
    chains: [robinhoodChain],
    transports: {
      [robinhoodChain.id]: http(robinhoodChain.rpcUrls.default.http[0]),
    },
    ssr: true,
  }),
);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
