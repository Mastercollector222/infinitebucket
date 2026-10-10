"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { sessionProof, type Proof } from "@/components/shop/Checkout";
import {
  MatchTable,
  type MatchBoardItem,
} from "@/app/leaderboard/games/MatchTable";

type BoardItem = MatchBoardItem;

// The match build posts { type: "ib-progress", game: "well", level } — accept
// its own identifier plus "match" so a future build can self-report either.
const GAME = "match";
const PROGRESS_TTL_MS = 25 * 60 * 1000; // re-sign after 25 min (server: 30)

// /play/match — the untouched game file in a same-origin iframe (it reads and
// writes its own localStorage saves, so no sandbox attribute). The parent
// owns wallet + saved level: on ib-progress messages it writes max_level
// through the signed API; the game is never handed anything that sets it.
export default function MatchPage() {
  const { status, address, connect, verify, signProgress } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const proofRef = useRef<{ proof: Proof; at: number } | null>(null);
  const lastSaved = useRef(0);

  const [src, setSrc] = useState<string | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [mine, setMine] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const signedIn =
    Boolean(address) &&
    (status === "ready" || status === "needs_username") &&
    sessionProof() != null;

  const fetchBoard = useCallback(async () => {
    const w = address ? `&wallet=${address}` : "";
    const res = await fetch(`/api/game/progress?game=${GAME}${w}`, { cache: "no-store" });
    const d = await res.json().catch(() => null);
    if (!d?.ok) return;
    setItems(d.items ?? []);
    if (d.mine != null) {
      setMine(d.mine);
      lastSaved.current = Math.max(lastSaved.current, d.mine);
    }
  }, [address]);

  // Resolve the resume level once: max(server best, the game's own saved
  // level — same origin, so ib-well-level is readable from here).
  useEffect(() => {
    let local = 0;
    try {
      local = parseInt(localStorage.getItem("ib-well-level") ?? "0", 10) || 0;
    } catch {
      /* storage unavailable */
    }
    const w = address ? `&wallet=${address}` : "";
    fetch(`/api/game/progress?game=${GAME}${w}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const remote = d?.ok ? (d.mine ?? 0) : 0;
        const level = Math.max(remote, local);
        lastSaved.current = Math.max(remote, local, 0);
        setMine(remote || null);
        setSrc(level >= 1 ? `/game/match.html?level=${level}` : "/game/match.html");
        if (d?.ok) setItems(d.items ?? []);
      })
      .catch(() => {
        setSrc(local >= 1 ? `/game/match.html?level=${local}` : "/game/match.html");
      });
    // Run once on mount — a mid-game wallet change must never remount the
    // iframe and lose the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress-session proof, cached ~25 min. First save pops one signature.
  const progressProof = useCallback(async (): Promise<Proof | null> => {
    const cached = proofRef.current;
    if (cached && Date.now() - cached.at < PROGRESS_TTL_MS) return cached.proof;
    const p = await signProgress(GAME);
    if (p) proofRef.current = { proof: p, at: Date.now() };
    return p;
  }, [signProgress]);

  const save = useCallback(
    async (level: number, retried = false) => {
      if (!signedIn || level <= lastSaved.current) return;
      const p = await progressProof();
      if (!p) return; // signature declined — level plays unsaved
      const res = await fetch("/api/game/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...p, game: GAME, level }),
      });
      const d = await res.json().catch(() => null);
      if (d?.ok) {
        lastSaved.current = Math.max(lastSaved.current, d.max_level);
        setMine(d.max_level);
        setNote(null);
        void fetchBoard();
      } else if (res.status === 401 && !retried) {
        proofRef.current = null; // stale cached proof → re-sign once
        return save(level, true);
      } else {
        setNote("Progress could not be saved.");
      }
    },
    [signedIn, progressProof, fetchBoard],
  );

  // Bridge: only messages from OUR iframe, only ib-progress, only sane ints.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { type?: string; game?: string; level?: unknown } | null;
      if (d?.type !== "ib-progress") return;
      if (d.game !== GAME && d.game !== "well") return;
      const level = typeof d.level === "number" ? Math.floor(d.level) : NaN;
      if (!Number.isInteger(level) || level < 1 || level > 100_000) return;
      void save(level);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [save]);

  // Re-pull the board when the wallet session changes (not the iframe).
  useEffect(() => {
    proofRef.current = null;
    void fetchBoard();
  }, [fetchBoard]);

  return (
    <div className="mx-auto max-w-6xl py-6" style={{ background: "#07040C" }}>
      <div className="mb-3 flex items-center justify-between">
        <Link
          href="/play"
          className="text-xs text-[var(--color-muted)] transition hover:text-[var(--color-white-soft)]"
        >
          ← All games
        </Link>
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
          {!signedIn && (
            <button
              type="button"
              onClick={() => (status === "idle" ? connect() : void verify())}
              className="rounded-md border border-[var(--color-stroke)] px-2.5 py-1.5 transition hover:border-[var(--color-amethyst)]"
            >
              Sign in to save progress
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Free to play — cash rewards require{" "}
        <span className="font-mono">5,000,000</span> $INFINITY held in the
        wallet.
      </p>

      <div className="relative overflow-hidden rounded-xl border border-[var(--color-stroke)] bg-[#07040C]">
        {src ? (
          <iframe
            ref={iframeRef}
            src={src}
            title="Match — Infinite Bucket"
            allow="fullscreen"
            allowFullScreen
            className="block h-[calc(100dvh-9rem)] w-full border-0"
          />
        ) : (
          <div className="flex h-[calc(100dvh-9rem)] items-center justify-center text-sm text-[var(--color-muted)]">
            Loading…
          </div>
        )}
      </div>

      {note && <p className="mt-2 text-xs text-[var(--color-muted)]">{note}</p>}

      <div className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
            Top levels
          </h2>
          {signedIn && (
            <span className="rounded-md border border-[var(--color-stroke)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-muted)]">
              Your best —{" "}
              {mine != null ? (
                <>
                  level{" "}
                  <span className="text-[var(--color-white-soft)]">{mine}</span>
                </>
              ) : (
                "none yet"
              )}
            </span>
          )}
        </div>
        <div className="mt-4">
          <MatchTable items={items} highlightWallet={address} />
        </div>
      </div>
    </div>
  );
}
