"use client";

import { useState } from "react";
import { useChainId, useSwitchChain, useWatchAsset } from "wagmi";
import { CHAIN, TOKEN, SITE_URL } from "@/lib/constants";
import { truncateAddress, compact } from "@/lib/format";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { useAuth } from "./AuthContext";
import { Avatar } from "./Avatar";

const addChainParameter = {
  chainName: CHAIN.name,
  nativeCurrency: { ...CHAIN.nativeCurrency },
  rpcUrls: [CHAIN.rpcUrl],
  blockExplorerUrls: [CHAIN.explorer],
};

// Wallet-only login: connect injected wallet → sign → verify → username.
export function WalletButton() {
  const { status, connect, verify, error } = useAuth();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const connected = status !== "idle" && status !== "connecting";
  const wrongNetwork = connected && chainId !== CHAIN.id;

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

  if (status === "needs_verify") {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => verify()}
          className="btn-metal rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          Sign in
        </button>
        {error && <span className="max-w-[220px] text-right text-xs text-[var(--color-sell)]">{error}</span>}
      </div>
    );
  }

  if (status === "connecting" || status === "signing" || status === "needs_username") {
    return (
      <button
        type="button"
        disabled
        className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-medium opacity-70"
      >
        {status === "connecting"
          ? "Connecting…"
          : status === "signing"
            ? "Check wallet…"
            : "Set username…"}
      </button>
    );
  }

  if (status === "ready") {
    return <ConnectedPill />;
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={connect}
        className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-medium"
      >
        Connect
      </button>
      {error && <span className="max-w-[220px] text-right text-xs text-[var(--color-sell)]">{error}</span>}
    </div>
  );
}

function ConnectedPill() {
  const { address, username, row, disconnect } = useAuth();
  const { balance, isLoading } = useInfinityBalance();
  const { watchAsset } = useWatchAsset();
  const [added, setAdded] = useState(false);

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={disconnect}
        title="Disconnect"
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-stroke)] bg-[rgba(28,20,44,0.6)] py-1 pl-1 pr-3 text-sm transition hover:border-[rgba(196,160,255,0.35)]"
      >
        <Avatar url={row?.avatar_url} wallet={address} username={username} size={40} />
        <span className="font-mono text-[var(--color-chrome)]">
          {username ?? truncateAddress(address)}
        </span>
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
