"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TOKEN } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";

type Props = {
  variant?: "chip" | "block" | "button";
  className?: string;
  label?: string;
};

// Copies the contract address and shows a transient toast. One tap on mobile.
export function CopyCA({ variant = "chip", className = "", label }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(TOKEN.address);
    } catch {
      // Fallback for browsers without clipboard API.
      const el = document.createElement("textarea");
      el.value = TOKEN.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  const display =
    variant === "block" ? TOKEN.address : truncateAddress(TOKEN.address, 6);

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy contract address"
        className={
          variant === "button"
            ? "btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            : "group inline-flex items-center gap-2 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-3 py-2 font-mono text-xs text-[var(--color-chrome)] transition hover:border-[rgba(196,160,255,0.35)] sm:text-sm"
        }
      >
        {label && <span className="font-body text-[var(--color-muted)]">{label}</span>}
        <span className={variant === "block" ? "font-mono break-all text-left" : ""}>
          {display}
        </span>
        <CopyIcon />
      </button>
      <AnimatePresence>
        {copied && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--color-stroke)] bg-[var(--color-panel-2)] px-3 py-1.5 text-xs text-[var(--color-white-soft)] shadow-lg"
          >
            Copied
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 15V6a2 2 0 0 1 2-2h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
