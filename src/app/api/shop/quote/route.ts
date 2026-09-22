import { NextResponse } from "next/server";
import { shippingUsdg, shopPriceUsdg } from "@/lib/shopServer";

export const revalidate = 30; // shop quote cache: 30s

// GET /api/shop/quote — INFINITY price denominated in USDG from the
// official Uniswap v4 pair (GeckoTerminal quote-token price, USD fallback,
// Dexscreener second fallback).
export async function GET() {
  const priceUsdg = await shopPriceUsdg();
  if (priceUsdg == null) {
    return NextResponse.json(
      { ok: false, error: "No quote available.", priceUsdg: null },
      { status: 200 },
    );
  }
  return NextResponse.json({
    ok: true,
    priceUsdg, // USDG per 1 INFINITY
    infinityPerUsdg: 1 / priceUsdg,
    shippingUsdg: shippingUsdg(),
    updatedAt: Date.now(),
  });
}
