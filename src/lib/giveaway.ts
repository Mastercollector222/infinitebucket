import { supabase } from "./supabase";
import { CHAIN, POOL, TOKEN } from "./constants";
import { IX } from "./engine";

// Reward the Holders — read-only giveaway. Computable both server-side and
// in the browser: the indexer is CORS-open and the public RPC accepts
// browser calls, so this module is the client fallback when a datacenter IP
// can't reach the indexer (same pattern as lib/engine.ts).
//
// Cutoff note: spec asked for "20 Sep 2026 17:00 Mountain" -> 00:00 UTC,
// then extended two days: 23 Sep 2026 00:00 UTC = Unix 1790121600.
// (The spec's literal 1758412800 is one year early — 2025.)
// Server-side override via GIVEAWAY_CUTOFF_TS.
export const GIVEAWAY_CUTOFF_TS =
  Number(process.env.GIVEAWAY_CUTOFF_TS) || 1_790_121_600;
export const GIVEAWAY_GATE = 5_000_000;
const GATE_RAW = 5_000_000n * 10n ** 18n; // 5,000,000 INFINITY, 18 decimals

export const GIVEAWAY_EXCLUDE = new Set(
  [
    POOL.poolManager, // Uniswap v4 pool liquidity — not a person
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    "0x7c268926fba61e88966956ba34a36f98d13e6006", // creator wallet
  ].map((a) => a.toLowerCase()),
);

export type GiveawayEntry = {
  index?: number;
  address: string;
  balance: number;
  username?: string | null;
  avatar_url?: string | null;
};

export type GiveawayBody = {
  phase: "before" | "after";
  cutoffTs: number;
  gate: number;
  estimate?: GiveawayEntry[];
  snapshotBlock?: { number: number; hash: string | null; ts: number | null };
  eligible?: GiveawayEntry[];
  winner?: { index: number; address: string; hashUint: string; mod: number } | null;
  approximate?: boolean;
  payoutTx?: string | null;
  updatedAt: number;
  ok: boolean;
  error?: string;
};

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(CHAIN.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

// Full holder list from the Bucket Shop indexer, plus the block the indexer
// was at — balances are as-of that block.
async function allHolders(): Promise<{
  list: { address: string; raw: bigint }[];
  block: number | null;
}> {
  const res = await fetch(`${IX}/holders/${TOKEN.address}`);
  if (!res.ok) throw new Error(`holders ${res.status}`);
  const j = (await res.json()) as {
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
async function snapshotBlock(cutoffTs: number): Promise<{
  number: number;
  hash: string | null;
  ts: number | null;
}> {
  const latest = BigInt((await rpc("eth_blockNumber", [])) as string);
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const b = await rpc("eth_getBlockByNumber", [
      `0x${mid.toString(16)}`,
      false,
    ]);
    const ts = b ? BigInt(b.timestamp) : 0n;
    if (ts <= BigInt(cutoffTs)) lo = mid;
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

// Computes the full giveaway payload. `payoutTx` is injected by the server
// route (env var); the browser fallback can't see it.
export async function computeGiveaway(opts?: {
  payoutTx?: string | null;
}): Promise<GiveawayBody> {
  const now = Date.now();
  const phase = now >= GIVEAWAY_CUTOFF_TS * 1000 ? "after" : "before";
  const { list: holders, block: idxBlock } = await allHolders();

  if (phase === "before") {
    // Live estimate only — NOT the official snapshot list.
    const estimate = holders
      .filter((h) => h.raw >= GATE_RAW && !GIVEAWAY_EXCLUDE.has(h.address))
      .sort((a, b) => (a.raw > b.raw ? -1 : 1));
    const profiles = await withProfiles(estimate.map((h) => h.address));
    return {
      phase,
      cutoffTs: GIVEAWAY_CUTOFF_TS,
      gate: GIVEAWAY_GATE,
      estimate: estimate.map((h) => ({
        address: h.address,
        balance: Number(h.raw / 10n ** 18n),
        ...profiles.get(h.address),
      })),
      updatedAt: now,
      ok: true,
    };
  }

  // AFTER cutoff: freeze the snapshot block, then reconstruct balances AT
  // it. The public RPC prunes state (no archive eth_call), so instead of
  // eth_call-at-block we take the indexer's current balances and walk back
  // every Transfer log between snapshot+1 and the indexer's block:
  //   balance_at_snapshot(w) = balance_now(w) - net_flow(w, snap+1..idx)
  // Any wallet that held at the snapshot either still appears in the
  // holder list or touched a post-snapshot transfer — so this is exact.
  const snap = await snapshotBlock(GIVEAWAY_CUTOFF_TS);
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
    .filter((b) => b.raw >= GATE_RAW && !GIVEAWAY_EXCLUDE.has(b.address))
    .sort((a, b) => (a.raw > b.raw ? -1 : 1));

  const profiles = await withProfiles(eligible.map((b) => b.address));

  let winner: GiveawayBody["winner"] = null;
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

  return {
    phase,
    cutoffTs: GIVEAWAY_CUTOFF_TS,
    gate: GIVEAWAY_GATE,
    snapshotBlock: snap,
    eligible: eligible.map((b, i) => ({
      index: i,
      address: b.address,
      balance: Number(b.raw / 10n ** 18n),
      ...profiles.get(b.address),
    })),
    winner,
    approximate,
    payoutTx: opts?.payoutTx ?? null,
    updatedAt: now,
    ok: true,
  };
}
