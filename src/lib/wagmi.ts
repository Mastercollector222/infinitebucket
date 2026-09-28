import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { robinhoodChain } from "./chain";

// WalletConnect Cloud project id — enables the multi-wallet modal
// (RainbowKit: injected wallets, WalletConnect QR, Coinbase Wallet, …).
// Without it we fall back to injected-only, no crash.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID?.trim() || "";
export const multiWallet = projectId.length > 0;

// Robinhood Chain 4663 is the ONLY configured chain — no default Ethereum
// chain to accidentally land on.
export const wagmiConfig = multiWallet
  ? getDefaultConfig({
      appName: "Infinite Bucket",
      projectId,
      chains: [robinhoodChain],
      transports: {
        [robinhoodChain.id]: http(robinhoodChain.rpcUrls.default.http[0]),
      },
      ssr: true,
    })
  : createConfig({
      chains: [robinhoodChain],
      connectors: [injected()],
      transports: {
        [robinhoodChain.id]: http(robinhoodChain.rpcUrls.default.http[0]),
      },
      ssr: true,
    });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
