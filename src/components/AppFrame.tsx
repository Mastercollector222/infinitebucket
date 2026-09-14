"use client";

import type { ReactNode } from "react";
import { MarketProvider } from "./MarketContext";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { StickyBuy } from "./StickyBuy";

// Client shell: shared live-data context + chrome around every page.
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <MarketProvider>
      <Nav />
      <main className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">{children}</main>
      <Footer />
      <StickyBuy />
    </MarketProvider>
  );
}
