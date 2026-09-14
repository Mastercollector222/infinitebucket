import { defineChain } from "viem";
import { CHAIN } from "./constants";

// Custom viem chain for Robinhood Chain (id 4663, native ETH).
export const robinhoodChain = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: {
    default: { http: [CHAIN.rpcUrl] },
    public: { http: [CHAIN.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: CHAIN.explorer,
      apiUrl: `${CHAIN.explorer}/api`,
    },
  },
  testnet: false,
});
