"use client";

import { useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWatchAsset,
} from "wagmi";
import { CHAIN, TOKEN, SITE_URL } from "@/lib/constants";
import { truncateAddress, compact } from "@/lib/format";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";

const addChainParameter = {
  chainName: CHAIN.name,
  nativeCurrency: { ...CHAIN.nativeCurrency },
  rpcUrls: [CHAIN.rpcUrl],
  blockExplorerUrls: [CHAIN.explorer],
};

// Injected-only connect (MetaMask / browser wallet). No WalletConnect, so no
// Verify API "suspected phishing" warnings.
export function WalletButton() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const injected = connectors[0];
  const wrongNetwork = isConnected && chainId !== CHAIN.id;

  if (wrongNetwork) {
    return (
      <button
        type="button"
        disabled={switching}
        onClick={() =>
          switchChain({ chainId: CHAIN.id, addEthereumChainParameter: addChainParameter })
        }
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-sell)]/50 bg-[rgba(255,93,122,0.12)] px-4 py-2.5 text-sm font-medium text-[var(--color-sell)] transition hover:bg-[rgba(255,93,122,0.18)]"
      >
        <span className="live-dot" style={{ background: "var(--color-sell)" }} />
        {switching ? "Switching…" : "Wrong network — Switch"}
      </button>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        disabled={connecting || !injected}
        onClick={() => injected && connect({ connector: injected })}
        className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect"}
      </button>
    );
  }

  return <ConnectedPill />;
}

function ConnectedPill() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { balance, isLoading } = useInfinityBalance();
  const { watchAsset } = useWatchAsset();
  const [added, setAdded] = useState(false);

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => disconnect()}
        title="Disconnect"
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.6)] px-3 py-2 text-sm transition hover:border-[rgba(196,160,255,0.35)]"
      >
        <span className="live-dot" />
        <span className="font-mono text-[var(--color-chrome)]">{truncateAddress(address)}</span>
        <span className="hidden text-[var(--color-muted)] sm:inline">
          {isLoading ? "…" : balance != null ? `${compact(balance)} ${TOKEN.symbol}` : "—"}
        </span>
      </button>
      <button
        type="button"
        title={`Add ${TOKEN.symbol} to wallet`}
        onClick={() => {
          watchAsset({
            type: "ERC20",
            options: {
              address: TOKEN.address,
              symbol: TOKEN.symbol,
              decimals: TOKEN.decimals,
              image:
                typeof window !== "undefined"
                  ? `${window.location.origin}/logo.jpeg`
                  : `${SITE_URL}/logo.jpeg`,
            },
          });
          setAdded(true);
          setTimeout(() => setAdded(false), 1600);
        }}
        className="hidden rounded-xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.6)] px-2.5 py-2 text-xs text-[var(--color-muted)] transition hover:text-[var(--color-chrome)] sm:inline"
      >
        {added ? "Added" : "+ Token"}
      </button>
    </div>
  );
}
