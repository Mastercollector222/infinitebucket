"use client";

import type { ReactNode } from "react";
import { MarketProvider } from "./MarketContext";
import { AuthProvider } from "./AuthContext";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { StickyBuy } from "./StickyBuy";
import { UsernameModal } from "./UsernameModal";

// Client shell: shared live-data + wallet-auth contexts around every page.
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <MarketProvider>
      <AuthProvider>
        <Nav />
        <main className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">{children}</main>
        <Footer />
        <StickyBuy />
        <UsernameModal />
      </AuthProvider>
    </MarketProvider>
  );
}
