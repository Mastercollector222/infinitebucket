import { NextResponse } from "next/server";
import { IX, parseEngineStats, findLaunchRecord, emptyEngine } from "@/lib/engine";

export const revalidate = 20;

// Server-side proxy for the Bucket Shop indexer. If the host's datacenter IP is
// blocked, the client falls back to fetching the indexer directly (CORS-open).
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
} as const;

export async function GET() {
  try {
    const get = async (url: string) => {
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 20 } });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    };
    const [payouts, launch] = await Promise.all([
      get(`${IX}/payouts`).catch(() => null),
      findLaunchRecord(get).catch(() => null),
    ]);
    return NextResponse.json(parseEngineStats(payouts, launch), { status: 200 });
  } catch (e) {
    return NextResponse.json(emptyEngine((e as Error).message), { status: 200 });
  }
}
