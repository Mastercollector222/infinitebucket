"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import {
  darkTheme,
  RainbowKitProvider,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import { multiWallet, wagmiConfig } from "@/lib/wagmi";
import { setConnectModal } from "@/lib/walletModal";

// Registers RainbowKit's openConnectModal into a module store so
// AuthContext can open it without importing RainbowKit hooks.
function ConnectModalBridge() {
  const { openConnectModal } = useConnectModal();
  useEffect(() => {
    setConnectModal(openConnectModal ?? null);
    return () => setConnectModal(null);
  }, [openConnectModal]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {multiWallet ? (
          <RainbowKitProvider
            modalSize="compact"
            theme={darkTheme({
              accentColor: "#a78bfa",
              accentColorForeground: "#0a0610",
              borderRadius: "medium",
            })}
          >
            <ConnectModalBridge />
            {children}
          </RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
