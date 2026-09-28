"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { useMarketContext } from "@/components/MarketContext";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { Avatar } from "@/components/Avatar";
import { BadgeMark } from "@/components/lounge/BadgeMark";
import { sessionProof } from "@/components/shop/Checkout";
import { LINKS } from "@/lib/constants";
import { formatUsdPrice, truncateAddress } from "@/lib/format";
import {
  badgeFor,
  LOUNGE_MAX_BODY,
  LOUNGE_MIN,
  sanitizeLoungeBody,
  type LoungeMessage,
} from "@/lib/lounge";
import { isAdmin } from "@/lib/shop";

function fmt(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export default function LoungePage() {
  const { status, address, connect, verify, signLounge } = useAuth();
  const { data: market } = useMarketContext();
  const { balance, isLoading: balLoading } = useInfinityBalance();

  const connected = status === "ready" || status === "needs_username";
  const needsSign = status === "needs_verify";
  const admitted = connected && balance != null && balance >= LOUNGE_MIN;

  return (
    <main className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col px-4 sm:px-6">
      {/* Room header — title, live price, connect */}
      <header className="flex flex-wrap items-center gap-3 border-b border-[rgba(167,139,250,0.18)] py-5">
        <div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-[#a78bfa]/70">
            Private floor
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
            Holders <span className="text-chrome">Lounge</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {market?.priceUsd != null && (
            <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-live)]/30 bg-[rgba(62,224,164,0.08)] px-3 py-1.5">
              <span className="live-dot" />
              <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] text-[var(--color-live)]">
                LIVE
              </span>
              <span className="font-mono text-xs text-[var(--color-chrome)]">
                {formatUsdPrice(market.priceUsd)}
              </span>
            </span>
          )}
          {!connected && (
            <button
              type="button"
              onClick={connect}
              className="btn-metal rounded-xl px-4 py-2 text-xs font-semibold"
            >
              {needsSign ? "Sign in" : "Connect"}
            </button>
          )}
        </div>
      </header>

      {!connected || !admitted ? (
        <LockPanel
          connected={connected}
          balance={balance}
          balLoading={balLoading}
          needsSign={needsSign}
          onConnect={connect}
          onVerify={() => verify()}
        />
      ) : (
        <Room wallet={address!} balance={balance ?? 0} signLounge={signLounge} verify={verify} />
      )}
    </main>
  );
}

/* ── Lock ─────────────────────────────────────────────────────────────── */

function LockPanel({
  connected,
  balance,
  balLoading,
  needsSign,
  onConnect,
  onVerify,
}: {
  connected: boolean;
  balance: number | null;
  balLoading: boolean;
  needsSign: boolean;
  onConnect: () => void;
  onVerify: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className="w-full max-w-md rounded-2xl border border-[rgba(167,139,250,0.22)] p-10 text-center"
        style={{
          background:
            "linear-gradient(160deg, rgba(24,16,34,0.9), rgba(18,10,8,0.9) 70%)",
          boxShadow: "0 0 80px rgba(120,80,200,0.07) inset",
        }}
      >
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-[#a78bfa]/70">
          Members only
        </p>
        <p className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
          {LOUNGE_MIN.toLocaleString("en-US")}{" "}
          <span className="text-chrome">$INFINITY</span>
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">to enter.</p>

        <div className="mt-6 rounded-xl border border-[rgba(167,139,250,0.15)] bg-[rgba(7,4,12,0.6)] px-4 py-3 font-mono text-xs">
          {connected ? (
            balLoading ? (
              <span className="text-[var(--color-muted)]">Reading balance…</span>
            ) : (
              <span className="text-[var(--color-chrome)]">
                Your balance: {fmt(balance ?? 0)} INFINITY
              </span>
            )
          ) : (
            <span className="text-[var(--color-muted)]">Wallet not connected</span>
          )}
        </div>

        <div className="mt-6 space-y-2">
          {!connected ? (
            <button
              type="button"
              onClick={onConnect}
              className="btn-metal w-full rounded-xl px-4 py-3 text-sm font-semibold"
            >
              {needsSign ? "Sign in with wallet" : "Connect wallet"}
            </button>
          ) : needsSign ? (
            <button
              type="button"
              onClick={onVerify}
              className="btn-metal w-full rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Sign in with wallet
            </button>
          ) : null}
          <a
            href={LINKS.trade}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost block w-full rounded-xl px-4 py-3 text-sm font-medium"
          >
            Buy $INFINITY
          </a>
        </div>

        <p className="mt-6 text-[0.65rem] leading-relaxed text-[var(--color-muted)]">
          Holders only. Live balance. Badges are on-chain, not purchased.
          Not financial advice.
        </p>
      </div>
    </div>
  );
}

/* ── Room ─────────────────────────────────────────────────────────────── */

function Room({
  wallet,
  balance,
  signLounge,
  verify,
}: {
  wallet: string;
  balance: number;
  signLounge: (
    body: string,
  ) => Promise<{ wallet: string; iso: string; signature: string } | null>;
  verify: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const admin = isAdmin(wallet);

  // Every poll returns the last 100 — full replace keeps deletes in sync.
  const load = useCallback(async () => {
    let p = sessionProof();
    if (!p || p.wallet !== wallet.toLowerCase()) {
      await verify();
      p = sessionProof();
    }
    if (!p) return;
    try {
      const res = await fetch("/api/lounge/messages", {
        headers: {
          "x-wallet": p.wallet,
          "x-iso": p.iso,
          "x-signature": p.signature,
        },
      });
      const j = await res.json();
      if (j.ok) setMessages(j.messages as LoungeMessage[]);
    } catch {
      /* transient poll failure — next tick retries */
    }
  }, [wallet, verify]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4_000);
    return () => clearInterval(t);
  }, [load]);

  // Stick to bottom only if the reader is already near it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const myBadge = badgeFor(balance); // live balance — recomputed every render

  const send = async () => {
    const clean = sanitizeLoungeBody(draft);
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await signLounge(clean);
      if (!p) throw new Error("Signature rejected — nothing sent.");
      const res = await fetch("/api/lounge/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...p, body: clean }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not send.");
      setDraft("");
      nearBottom.current = true;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const adminCall = async (path: string, payload: Record<string, unknown>) => {
    const p = sessionProof();
    if (!p) return;
    const res = await fetch(path, {
      method: path.endsWith("/lounge") ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, ...payload }),
    });
    const j = await res.json();
    if (!j.ok) setError(j.error ?? "Moderation failed.");
    load();
  };

  return (
    <>
      {/* Message floor */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-4"
      >
        {messages.length === 0 ? (
          <p className="py-16 text-center font-mono text-xs text-[#6f6580]">
            The floor is quiet. First word is yours.
          </p>
        ) : (
          messages.map((m) => {
            const name = m.username ?? truncateAddress(m.wallet, 4);
            return (
              <div key={m.id} className="group flex gap-3 px-2 py-2.5">
                <Avatar
                  url={m.avatar_url}
                  wallet={m.wallet}
                  username={m.username}
                  size={30}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {m.username ? (
                      <Link
                        href={`/u/${m.username}`}
                        className="text-[0.8rem] font-semibold text-[var(--color-chrome)] transition hover:text-[var(--color-white-soft)]"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="font-mono text-[0.8rem] text-[var(--color-chrome)]">
                        {name}
                      </span>
                    )}
                    {m.badge && <BadgeMark badge={m.badge} />}
                    <span className="font-mono text-[0.55rem] text-[#6f6580]">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {admin && (
                      <span className="hidden gap-2 group-hover:inline-flex">
                        <button
                          type="button"
                          onClick={() =>
                            adminCall(`/api/admin/lounge/${m.id}`, {})
                          }
                          className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--color-sell)]"
                        >
                          delete
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adminCall("/api/admin/lounge", {
                              action: "mute",
                              target: m.wallet,
                              hours: 24,
                            })
                          }
                          className="font-mono text-[0.55rem] uppercase tracking-wider text-[#c9a86a]"
                        >
                          mute 24h
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.85rem] leading-relaxed text-[#cfc6dd]">
                    {m.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer — pinned to the bottom of the room */}
      <div className="border-t border-[rgba(167,139,250,0.18)] py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            {myBadge && <BadgeMark badge={myBadge} />}
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-[#6f6580]">
              on-chain badge · rechecked live
            </span>
          </span>
          <span
            className={`font-mono text-[0.6rem] ${draft.length > LOUNGE_MAX_BODY ? "text-[var(--color-sell)]" : "text-[#6f6580]"}`}
          >
            {draft.length}/{LOUNGE_MAX_BODY}
          </span>
        </div>
        <div
          className="flex items-end gap-2 rounded-2xl border border-[rgba(167,139,250,0.22)] p-2"
          style={{
            background:
              "linear-gradient(160deg, rgba(28,20,14,0.55), rgba(14,8,22,0.85))",
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, LOUNGE_MAX_BODY + 20))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Speak quietly. The room can see your balance, not your keys."
            className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-[var(--color-white-soft)] outline-none placeholder:text-[#6f6580]"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !sanitizeLoungeBody(draft)}
            className="btn-metal shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--color-sell)]">{error}</p>}
        <p className="mt-2 font-mono text-[0.55rem] text-[#564d68]">
          Holders only. Live balance. Badges are on-chain, not purchased. Not
          financial advice.
        </p>
      </div>
    </>
  );
}
