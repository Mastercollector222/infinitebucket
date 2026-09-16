import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "./chain";

// Injected-only wallet config (MetaMask / browser wallets). We intentionally do
// NOT use WalletConnect: its Verify API flags dApps whose domain isn't tied to
// a WalletConnect Cloud project, which produced the "suspected phishing"
// warnings. Injected connections talk to the wallet directly — no relay, no
// verify step, no warning — and need no project id.
export const wagmiConfig = createConfig({
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
