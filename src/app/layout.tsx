import type { Metadata, Viewport } from "next";
import { Syne, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppFrame } from "@/components/AppFrame";
import { SITE_URL } from "@/lib/constants";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InfiniteBucket — $INFINITY on Robinhood Chain",
  description:
    "$INFINITY on Robinhood Chain. Launched on Bucket Shop. Built to route flow into a BucketShop-paying engine.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "InfiniteBucket — The bucket that never empties.",
    description: "$INFINITY on Robinhood Chain. Launched on Bucket Shop.",
    images: ["/logo.jpeg"],
  },
  icons: { icon: "/logo.jpeg" },
};

export const viewport: Viewport = {
  themeColor: "#07040C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-void-bloom">
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
