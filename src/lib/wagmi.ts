import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  getDefaultConfig,
  getWalletConnectConnector,
  type Wallet,
} from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { robinhoodChain } from "./chain";

// WalletConnect Cloud project id — enables the multi-wallet modal
// (injected wallets, WalletConnect QR, Coinbase Wallet, Robinhood Wallet).
// Without it we fall back to injected-only, no crash.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID?.trim() || "";
export const multiWallet = projectId.length > 0;

// Robinhood Wallet isn't in RainbowKit's built-in registry — define it as a
// WalletConnect-backed wallet (explorer id 8837dd94…, native scheme
// robinhood-wallet://, injected flag isRobinhoodMobileWallet). Mobile taps
// deep-link into the app with the WC URI; desktop shows the QR.
const robinhoodWallet = ({ projectId }: { projectId: string }): Wallet => ({
  id: "robinhood",
  name: "Robinhood Wallet",
  shortName: "Robinhood",
  rdns: "com.robinhood.wallet",
  iconUrl: "/wallets/robinhood.png",
  iconBackground: "#000000",
  downloadUrls: {
    ios: "https://robinhood.com/web3-wallet/",
    android: "https://play.google.com/store/apps/details?id=com.robinhood.gateway",
    mobile: "https://robinhood.com/web3-wallet/",
    qrCode: "https://robinhood.com/web3-wallet/",
  },
  mobile: {
    getUri: (uri: string) => `robinhood-wallet://wc?uri=${encodeURIComponent(uri)}`,
  },
  qrCode: {
    getUri: (uri: string) => uri,
  },
  createConnector: getWalletConnectConnector({ projectId }),
});

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
      wallets: [
        {
          groupName: "Recommended",
          wallets: [
            robinhoodWallet,
            metaMaskWallet,
            rabbyWallet,
            coinbaseWallet,
            walletConnectWallet,
            injectedWallet,
          ],
        },
      ],
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
