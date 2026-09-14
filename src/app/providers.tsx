"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          mode="dark"
          options={{ enforceSupportedChains: true, initialChainId: 4663 }}
          customTheme={{
            "--ck-font-family": "var(--font-body)",
            "--ck-border-radius": "14px",
            "--ck-overlay-background": "rgba(7,4,12,0.72)",
            "--ck-body-background": "#0E0816",
            "--ck-body-background-secondary": "#161022",
            "--ck-primary-button-background": "#1C142C",
            "--ck-connectbutton-background": "#161022",
            "--ck-connectbutton-color": "#F7F4FF",
            "--ck-accent-color": "#8B5CF6",
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
