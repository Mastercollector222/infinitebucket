import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CHAIN, POOL, TOKEN } from "@/lib/constants";
import { IX } from "@/lib/engine";

// Reward the Holders — read-only giveaway. The site never custody funds;
// the winner is derived from chain data anyone can recompute.
//
// Cutoff note: spec asked for "20 Sep 2026 17:00 Mountain" -> 21 Sep 2026
// 00:00 UTC. That instant is Unix 1789948800 (the spec's literal
// 1758412800 is one year early — 2025). Override via GIVEAWAY_CUTOFF_TS.
const CUTOFF_TS = Number(process.env.GIVEAWAY_CUTOFF_TS) || 1_789_948_800;
const GATE_RAW = 5_000_000n * 10n ** 18n; // 5,000,000 INFINITY, 18 decimals

const EXCLUDE = new Set(
  [
    POOL.poolManager, // Uniswap v4 pool liquidity — not a person
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    "0x7c268926fba61e88966956ba34a36f98d13e6006", // creator wallet
  ].map((a) => a.toLowerCase()),
);

// before-cutoff responses refresh every 60s; post-cutoff result is
// deterministic (snapshot block + winner can't change), cached 6h.
const cache = new Map<string, { body: unknown; ts: number }>();

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(CHAIN.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

// Full holder list from the Bucket Shop indexer (no Cloudflare wall), plus
// the block the indexer was at — balances are as-of that block.
async function allHolders(): Promise<{
  list: { address: string; raw: bigint }[];
  block: number | null;
}> {
  const j = (await (
    await fetch(`${IX}/holders/${TOKEN.address}`)
  ).json()) as {
    holders?: { address: string; balance: string }[];
    block?: number;
  };
  const list = (j.holders ?? [])
    .map((h) => {
      try {
        return { address: h.address.toLowerCase(), raw: BigInt(h.balance) };
      } catch {
        return null;
      }
    })
    .filter((h): h is { address: string; raw: bigint } => h != null);
  return { list, block: typeof j.block === "number" ? j.block : null };
}

// Largest block whose timestamp is <= cutoff.
async function snapshotBlock(): Promise<{
  number: number;
  hash: string | null;
  ts: number | null;
}> {
  const latest = BigInt(
    (await rpc("eth_blockNumber", [])) as string,
  );
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const b = await rpc("eth_getBlockByNumber", [
      `0x${mid.toString(16)}`,
      false,
    ]);
    const ts = b ? BigInt(b.timestamp) : 0n;
    if (ts <= BigInt(CUTOFF_TS)) lo = mid;
    else hi = mid - 1n;
  }
  const block = await rpc("eth_getBlockByNumber", [
    `0x${lo.toString(16)}`,
    false,
  ]);
  return {
    number: Number(lo),
    hash: block?.hash ?? null,
    ts: block ? Number(BigInt(block.timestamp)) : null,
  };
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// eth_getLogs over [fromBlock..toBlock], halving the range when the node
// rejects wide spans. Works on non-archive nodes — no historical state needed.
async function logsBetween(
  fromBlock: number,
  toBlock: number,
): Promise<Record<string, any>[]> {
  const res = await rpc("eth_getLogs", [
    {
      address: TOKEN.address,
      topics: [TRANSFER_TOPIC],
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    },
  ]);
  if (Array.isArray(res)) return res;
  if (toBlock - fromBlock <= 1) throw new Error("eth_getLogs failed");
  const mid = fromBlock + Math.floor((toBlock - fromBlock) / 2);
  return [
    ...(await logsBetween(fromBlock, mid)),
    ...(await logsBetween(mid + 1, toBlock)),
  ];
}

export async function GET() {
  const now = Date.now();
  const phase = now >= CUTOFF_TS * 1000 ? "after" : "before";
  const ttl = phase === "before" ? 60_000 : 6 * 3_600_000;
  const hit = cache.get("g");
  if (hit && Date.now() - hit.ts < ttl && (hit.body as any)?.phase === phase) {
    return NextResponse.json(hit.body);
  }

  try {
    const { list: holders, block: idxBlock } = await allHolders();

    if (phase === "before") {
      // Live estimate only — NOT the official snapshot list.
      const estimate = holders
        .filter((h) => h.raw >= GATE_RAW && !EXCLUDE.has(h.address))
        .sort((a, b) => (a.raw > b.raw ? -1 : 1));
      const body = {
        phase,
        cutoffTs: CUTOFF_TS,
        gate: 5_000_000,
        estimate: await withProfiles(
          estimate.map((h) => h.address),
        ).then((profiles) =>
          estimate.map((h) => ({
            address: h.address,
            balance: Number(h.raw / 10n ** 18n),
            ...profiles.get(h.address),
          })),
        ),
        updatedAt: now,
        ok: true,
      };
      cache.set("g", { body, ts: now });
      return NextResponse.json(body);
    }

    // AFTER cutoff: freeze the snapshot block, then reconstruct balances AT
    // it. The public RPC prunes state (no archive eth_call), so instead of
    // eth_call-at-block we take the indexer's current balances and walk back
    // every Transfer log between snapshot+1 and the indexer's block:
    //   balance_at_snapshot(w) = balance_now(w) - net_flow(w, snap+1..idx)
    // Any wallet that held at the snapshot either still appears in the
    // holder list or touched a post-snapshot transfer — so this is exact.
    const snap = await snapshotBlock();
    const latestBn = Number(BigInt(await rpc("eth_blockNumber", [])));
    const netEnd = Math.min(idxBlock ?? latestBn, latestBn);

    const net = new Map<string, bigint>();
    let approximate = false;
    if (netEnd > snap.number) {
      try {
        const logs = await logsBetween(snap.number + 1, netEnd);
        for (const l of logs) {
          const from = `0x${String(l.topics?.[1] ?? "").slice(26)}`;
          const to = `0x${String(l.topics?.[2] ?? "").slice(26)}`;
          const v = BigInt(l.data);
          net.set(to, (net.get(to) ?? 0n) + v);
          net.set(from, (net.get(from) ?? 0n) - v);
        }
      } catch {
        approximate = true; // fall back to current balances, flagged below
      }
    }

    const cand = new Map<string, bigint>();
    for (const h of holders) cand.set(h.address, h.raw);
    if (!approximate) {
      for (const [a, delta] of net) {
        cand.set(a, (cand.get(a) ?? 0n) - delta);
      }
    }

    const eligible = [...cand.entries()]
      .map(([address, raw]) => ({ address, raw }))
      .filter((b) => b.raw >= GATE_RAW && !EXCLUDE.has(b.address))
      .sort((a, b) => (a.raw > b.raw ? -1 : 1));

    const profiles = await withProfiles(eligible.map((b) => b.address));

    let winner: {
      index: number;
      address: string;
      hashUint: string;
      mod: number;
    } | null = null;
    if (snap.hash && eligible.length > 0) {
      const hashUint = BigInt(snap.hash);
      const idx = Number(hashUint % BigInt(eligible.length));
      winner = {
        index: idx,
        address: eligible[idx].address,
        hashUint: hashUint.toString(),
        mod: eligible.length,
      };
    }

    const body = {
      phase,
      cutoffTs: CUTOFF_TS,
      gate: 5_000_000,
      snapshotBlock: snap,
      eligible: eligible.map((b, i) => ({
        index: i,
        address: b.address,
        balance: Number(b.raw / 10n ** 18n),
        ...profiles.get(b.address),
      })),
      winner,
      approximate,
      payoutTx: process.env.GIVEAWAY_PAYOUT_TX || null,
      updatedAt: now,
      ok: true,
    };
    cache.set("g", { body, ts: now });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, phase },
      { status: 200 },
    );
  }
}

async function withProfiles(
  addrs: string[],
): Promise<Map<string, { username: string | null; avatar_url: string | null }>> {
  const map = new Map<
    string,
    { username: string | null; avatar_url: string | null }
  >();
  if (!supabase || addrs.length === 0) return map;
  const { data } = await supabase
    .from("users")
    .select("wallet, username, avatar_url")
    .in("wallet", addrs);
  for (const u of data ?? []) {
    map.set(u.wallet as string, {
      username: (u.username as string | null) ?? null,
      avatar_url: (u.avatar_url as string | null) ?? null,
    });
  }
  return map;
}
