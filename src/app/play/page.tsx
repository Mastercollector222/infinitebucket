"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { useInfinityBalance } from "@/hooks/useInfinityBalance";
import { sessionProof, type Proof } from "@/components/shop/Checkout";
import { compact } from "@/lib/format";
import type { PlayStats } from "@/lib/play";

function msUntilUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime();
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// /play — the existing Drop table in an isolated iframe. The parent owns the
// wallet, the daily cap, and the career score; the game only reports
// drop_start / drop_win / drop_lose via postMessage and is never handed
// anything that could set a score.
export default function PlayPage() {
  const { status, address, verify, signPlay } = useAuth();
  const { balance, isLoading: balLoading } = useInfinityBalance();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const starting = useRef(false);

  const [proof, setProof] = useState<Proof | null>(() => sessionProof());
  const [stats, setStats] = useState<PlayStats | null>(null);
  const [capped, setCapped] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const connected = Boolean(address) && status !== "idle";
  const holder = connected && balance != null && balance > 0;
  // Scorekeeping needs a verified session — connected-but-unverified plays demo.
  const canScore = holder && proof != null;

  // Mount the table once we know whether a wallet + balance exist, so the
  // first drop_start lands on a settled auth state.
  const tableReady = !connected || (!balLoading && balance != null);

  // Countdown ticker while capped.
  useEffect(() => {
    if (!capped) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [capped]);

  // Re-read the stored proof when the session changes (sign-in completes).
  useEffect(() => {
    setProof(sessionProof());
  }, [status, address]);

  const fetchScore = useCallback(async (p: Proof) => {
    const res = await fetch("/api/play/score", {
      headers: { "x-wallet": p.wallet, "x-iso": p.iso, "x-signature": p.signature },
      cache: "no-store",
    });
    const d = await res.json().catch(() => null);
    if (!d?.ok || d.demo) return;
    setStats({ wins: d.wins, games_played: d.games_played, remaining: d.remaining, cap: d.cap });
    setCapped(d.remaining <= 0);
  }, []);

  // Prime the HUD with the current row — does not consume a play.
  useEffect(() => {
    if (proof && holder) void fetchScore(proof);
    if (!holder) { setStats(null); setCapped(false); }
  }, [proof, holder, fetchScore]);

  const onStart = useCallback(async () => {
    if (!canScore || starting.current) return;
    starting.current = true;
    try {
      const p = await signPlay("play_start");
      if (!p) return; // user declined → this match plays uncounted (demo rules)
      const res = await fetch("/api/play/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const d = await res.json().catch(() => null);
      if (!d?.ok || d.demo) return;
      setStats({ wins: d.wins, games_played: d.games_played, remaining: d.remaining, cap: d.cap });
      setCapped(!d.allowed);
      if (!d.allowed) setNote("Daily cap reached — back at midnight UTC.");
    } finally {
      starting.current = false;
    }
  }, [canScore, signPlay]);

  const onWin = useCallback(async () => {
    if (!canScore) return;
    const p = await signPlay("play_result");
    if (!p) { setNote("Win not recorded — signature declined."); return; }
    const res = await fetch("/api/play/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, outcome: "win" }),
    });
    const d = await res.json().catch(() => null);
    if (d?.ok) {
      setStats((s) => (s ? { ...s, wins: d.wins } : s));
      setNote(null);
    } else if (res.status === 409) {
      setNote("That match wasn't counted — start a new game to keep score.");
    } else {
      setNote("Win could not be recorded.");
    }
  }, [canScore, signPlay]);

  // Bridge: only messages from OUR iframe, only the three known types.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === "drop_start") void onStart();
      else if (type === "drop_win") void onWin();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onStart, onWin]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--color-amethyst)]">
            Play
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-4xl">
            Drop
          </h1>
        </div>
        {stats && (
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
            <span className="rounded-md border border-[var(--color-stroke)] px-2.5 py-1.5">
              Career <span className="text-[var(--color-white-soft)]">{compact(stats.wins)}</span> wins
            </span>
            <span className="rounded-md border border-[var(--color-stroke)] px-2.5 py-1.5">
              <span className="text-[var(--color-white-soft)]">{stats.remaining}</span>/{stats.cap} left today
            </span>
          </div>
        )}
      </div>

      {!canScore && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3">
          <p className="text-sm text-[var(--color-muted)]">
            {connected && holder
              ? "Sign in to keep score."
              : "Connect and hold $INFINITY to keep score."}
          </p>
          {connected && holder && !proof && (
            <button
              type="button"
              onClick={() => void verify()}
              className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              Sign in
            </button>
          )}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden rounded-xl border border-[var(--color-stroke)] bg-[var(--color-ink)]" style={{ minHeight: 560 }}>
        {tableReady ? (
          <iframe
            ref={iframeRef}
            src="/game/drop.html"
            title="Drop — Infinite Bucket"
            sandbox="allow-scripts allow-downloads"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
            Loading the table…
          </div>
        )}
        {capped && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[rgba(7,4,12,0.94)] px-6 text-center">
            <h2 className="font-display text-2xl font-bold text-[var(--color-white-soft)]">
              Table closed for today
            </h2>
            <p className="text-sm text-[var(--color-muted)]">
              New game resets at midnight UTC — in {fmtCountdown(Date.now() + msUntilUtcMidnight() - now)}.
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Hold more $INFINITY for more games tomorrow.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
        <span>{note ?? "First to 5 Drops takes the match. House deals."}</span>
        <span className="shrink-0">Hold more $INFINITY for more games tomorrow.</span>
      </div>
    </div>
  );
}
