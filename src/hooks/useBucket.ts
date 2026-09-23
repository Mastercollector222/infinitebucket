"use client";

import { useEffect, useState } from "react";
import type { BucketQuote } from "@/lib/types";

// Polls /api/bucket every 30s. Returns null whenever the feed is down so
// callers render nothing — never a stale hardcoded price.
export function useBucketPrice(): { priceUsd: number; change24h: number | null } | null {
  const [quote, setQuote] = useState<BucketQuote | null>(null);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch("/api/bucket")
        .then((r) => r.json())
        .then((j: BucketQuote) => {
          if (!dead) setQuote(j?.ok ? j : null);
        })
        .catch(() => {
          if (!dead) setQuote(null);
        });
    load();
    const t = setInterval(load, 30_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  return quote?.priceUsd != null
    ? { priceUsd: quote.priceUsd, change24h: quote.change24h }
    : null;
}
