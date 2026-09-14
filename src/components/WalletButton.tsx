"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useChainId, useSwitchChain, useWatchAsset } from "wagmi";
import { CHAIN, TOKEN, SITE_URL } from "@/lib/constants";
import { truncateAddress, compact } from "@/lib/format";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";

const addChainParameter = {
  chainName: CHAIN.name,
  nativeCurrency: { ...CHAIN.nativeCurrency },
  rpcUrls: [CHAIN.rpcUrl],
  blockExplorerUrls: [CHAIN.explorer],
};

export function WalletButton() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN.id;

  if (wrongNetwork) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          switchChain({ chainId: CHAIN.id, addEthereumChainParameter: addChainParameter })
        }
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-sell)]/50 bg-[rgba(255,93,122,0.12)] px-4 py-2.5 text-sm font-medium text-[var(--color-sell)] transition hover:bg-[rgba(255,93,122,0.18)]"
      >
        <span className="live-dot stale-dot" style={{ background: "var(--color-sell)" }} />
        {isPending ? "Switching…" : "Wrong network — Switch"}
      </button>
    );
  }

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, address }) => {
        if (!isConnected) {
          return (
            <button
              type="button"
              onClick={() => show?.()}
              className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Connect
            </button>
          );
        }
        return <ConnectedPill address={address} onClick={() => show?.()} />;
      }}
    </ConnectKitButton.Custom>
  );
}

function ConnectedPill({ address, onClick }: { address?: string; onClick: () => void }) {
  const { balance, isLoading } = useInfinityBalance();
  const { watchAsset } = useWatchAsset();
  const [added, setAdded] = useState(false);

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.6)] px-3 py-2 text-sm transition hover:border-[rgba(196,160,255,0.35)]"
      >
        <span className="live-dot" />
        <span className="font-mono text-[var(--color-chrome)]">{truncateAddress(address)}</span>
        <span className="hidden text-[var(--color-muted)] sm:inline">
          {isLoading ? "…" : balance != null ? `${compact(balance)} INFINITY` : "—"}
        </span>
      </button>
      <button
        type="button"
        title="Add INFINITY to wallet"
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
