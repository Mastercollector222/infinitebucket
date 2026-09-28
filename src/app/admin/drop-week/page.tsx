"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { loadSession } from "@/lib/auth";
import { adminWallets } from "@/lib/shop";
import { truncateAddress } from "@/lib/format";

type Proof = { wallet: string; iso: string; signature: string };

function proof(): Proof | null {
  const s = loadSession();
  return s?.proof?.v === 2
    ? { wallet: s.wallet, iso: s.proof.iso, signature: s.proof.signature }
    : null;
}

type WeekRow = {
  week_id: string;
  prize_usdg: number;
  payout_tx: string | null;
  closed: boolean;
  leader: { wallet: string; wins: number } | null;
};

async function post(action: string, payload: Record<string, unknown> = {}) {
  const p = proof();
  if (!p) throw new Error("No verified session — sign in again.");
  const res = await fetch("/api/admin/drop-week", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...p, action, ...payload }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Request failed.");
  return j;
}

// /admin/drop-week — weekly prize admin: set the USDG prize, paste the
// payout tx hash after sending, and close a week. Meta only — the site
// never custodies or sends funds.
export default function AdminDropWeekPage() {
  const { status, address, connect } = useAuth();
  const admins = adminWallets();
  const wallet = address?.toLowerCase();
  const authorized = wallet != null && admins.includes(wallet);
  const connected = status === "ready" || status === "needs_username";

  const [weeks, setWeeks] = useState<WeekRow[] | null>(null);
  const [currentWeek, setCurrentWeek] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [prize, setPrize] = useState<Record<string, string>>({});
  const [tx, setTx] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const p = proof();
    if (!p) return;
    const res = await fetch("/api/admin/drop-week", {
      headers: { "x-wallet": p.wallet, "x-iso": p.iso, "x-signature": p.signature },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (j?.ok) {
      setWeeks(j.weeks);
      setCurrentWeek(j.current_week);
    }
  }, []);

  useEffect(() => {
    if (connected && authorized) void refresh();
  }, [connected, authorized, refresh]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      void refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-14 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--color-live)]">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
          Drop <span className="text-chrome">weeks</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Current UTC week: <span className="font-mono">{currentWeek || "…"}</span>
        </p>
      </header>

      {!connected ? (
        <div className="glass max-w-md p-8 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            Connect an admin wallet to manage Drop weeks.
          </p>
          <button
            type="button"
            onClick={connect}
            className="btn-metal mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Connect
          </button>
        </div>
      ) : !authorized ? (
        <div className="glass max-w-md p-8 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            This wallet isn&apos;t on the admin list.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {msg && <p className="text-sm text-[var(--color-chrome)]">{msg}</p>}
          {(weeks ?? []).length === 0 && weeks != null && (
            <p className="text-sm text-[var(--color-muted)]">
              No weeks on record yet — they appear as matches are played.
            </p>
          )}
          {(weeks ?? []).map((w) => (
            <div key={w.week_id} className="glass p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-bold text-[var(--color-white-soft)]">
                    Week {w.week_id}
                  </span>
                  {w.week_id === currentWeek && (
                    <span className="ml-2 rounded-md border border-[var(--color-live)]/40 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--color-live)]">
                      Current
                    </span>
                  )}
                  {w.closed && (
                    <span className="ml-2 rounded-md border border-[var(--color-stroke)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Closed
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--color-muted)]">
                  {w.leader
                    ? `Leader: ${truncateAddress(w.leader.wallet)} · ${w.leader.wins} wins`
                    : "No scored matches"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                  Prize (USDG)
                  <span className="flex gap-2">
                    <input
                      className="w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 font-mono text-sm text-[var(--color-white-soft)] outline-none focus:border-[rgba(196,160,255,0.45)]"
                      defaultValue={String(w.prize_usdg)}
                      onChange={(e) => setPrize((s) => ({ ...s, [w.week_id]: e.target.value }))}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      className="btn-ghost rounded-lg px-3 py-2 text-xs"
                      onClick={() =>
                        run(
                          () =>
                            post("set_prize", {
                              week_id: w.week_id,
                              prize_usdg: Number(prize[w.week_id] ?? w.prize_usdg),
                            }),
                          "Prize saved.",
                        )
                      }
                    >
                      Save
                    </button>
                  </span>
                </label>

                <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)] sm:col-span-2">
                  Payout tx hash (0x…)
                  <span className="flex gap-2">
                    <input
                      className="w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 font-mono text-xs text-[var(--color-white-soft)] outline-none focus:border-[rgba(196,160,255,0.45)]"
                      placeholder={w.payout_tx ?? "paste after sending the USDG"}
                      defaultValue={w.payout_tx ?? ""}
                      onChange={(e) => setTx((s) => ({ ...s, [w.week_id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn-ghost rounded-lg px-3 py-2 text-xs"
                      onClick={() =>
                        run(
                          () =>
                            post("set_payout", {
                              week_id: w.week_id,
                              payout_tx: tx[w.week_id] ?? w.payout_tx ?? "",
                            }),
                          "Payout tx saved.",
                        )
                      }
                    >
                      Save
                    </button>
                  </span>
                </label>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
                  onClick={() =>
                    run(
                      () => post("set_closed", { week_id: w.week_id, closed: !w.closed }),
                      w.closed ? "Week re-opened." : "Week closed.",
                    )
                  }
                >
                  {w.closed ? "Re-open week" : "Mark closed"}
                </button>
                {w.payout_tx && (
                  <span className="font-mono text-xs text-[var(--color-muted)]">
                    tx {truncateAddress(w.payout_tx, 8)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
