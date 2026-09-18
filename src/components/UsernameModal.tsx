"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "./AuthContext";

// Shown after first verified login until the wallet picks a username.
export function UsernameModal() {
  const { status, submitUsername, error, clearError } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const open = status === "needs_username";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await submitUsername(value);
    if (ok) setValue("");
    setBusy(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,4,12,0.75)] p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="glass w-full max-w-sm p-6"
          >
            <h2 className="font-display text-xl font-extrabold text-[var(--color-white-soft)]">
              Pick a <span className="text-chrome">username</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              Your wallet is verified. Choose the name shown on the leaderboard — one change per
              wallet for now.
            </p>
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  clearError();
                }}
                placeholder="e.g. bucket_whale_07"
                autoFocus
                maxLength={16}
                className="w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
              />
              {error && <p className="text-sm text-[var(--color-sell)]">{error}</p>}
              <button
                type="submit"
                disabled={busy || !value.trim()}
                className="btn-metal rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Claim username"}
              </button>
              <p className="text-center text-xs text-[var(--color-muted)]">
                3–16 characters · letters, numbers, underscore
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
