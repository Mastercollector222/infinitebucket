"use client";

import { useState } from "react";
import { CHAIN } from "@/lib/constants";

// Adds Robinhood Chain to an injected wallet via wallet_addEthereumChain.
export function AddChainButton() {
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");

  const add = async () => {
    const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } })
      .ethereum;
    if (!eth) {
      setStatus("error");
      return;
    }
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN.idHex,
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.nativeCurrency,
            rpcUrls: [CHAIN.rpcUrl],
            blockExplorerUrls: [CHAIN.explorer],
          },
        ],
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <button type="button" onClick={add} className="btn-metal rounded-xl px-5 py-3 text-sm font-semibold">
      {status === "done"
        ? "Chain added"
        : status === "error"
          ? "No wallet detected"
          : "Add Robinhood Chain"}
    </button>
  );
}
