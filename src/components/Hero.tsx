"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { LINKS } from "@/lib/constants";
import { CopyCA } from "./CopyCA";
import { LivePill } from "./LivePill";
import { useMarketContext } from "./MarketContext";
import { formatUsd, formatPercent } from "@/lib/format";

// Section B: left typography, right orbiting bucket with metal sheen.
export function Hero() {
  const { data } = useMarketContext();
  const change = data?.change24h ?? null;

  return (
    <section className="grid items-center gap-10 pb-6 pt-14 sm:pt-20 lg:grid-cols-2 lg:gap-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mb-5 inline-flex items-center gap-2">
          <LivePill />
          <span className="rounded-full border border-[var(--color-stroke)] px-2.5 py-1 font-mono text-xs text-[var(--color-amethyst)]">
            Robinhood Chain · 4663
          </span>
        </div>

        <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.92] tracking-tight text-[var(--color-white-soft)] sm:text-6xl">
          The bucket
          <br />
          that never
          <br />
          <span className="text-chrome">empties.</span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          $INFINITY on Robinhood Chain. Launched on Bucket Shop. Built to route flow into a
          BucketShop-paying engine.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={LINKS.trade}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-metal rounded-xl px-6 py-3.5 text-base font-semibold"
          >
            Buy INFINITY
          </a>
          <CopyCA variant="button" label="Copy CA" />
          <a
            href={LINKS.geckoterminal}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost rounded-xl px-5 py-3.5 text-sm font-medium"
          >
            View live pool
          </a>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <CopyCA variant="chip" />
          {data?.priceUsd != null && (
            <span className="font-mono text-sm text-[var(--color-muted)]">
              {formatUsd(data.priceUsd)}
              {change != null && (
                <span
                  className={
                    change >= 0 ? "ml-2 text-[var(--color-buy)]" : "ml-2 text-[var(--color-sell)]"
                  }
                >
                  {formatPercent(change)}
                </span>
              )}
            </span>
          )}
        </div>
      </motion.div>

      <div className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center">
        {/* violet bloom */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.28),transparent_62%)] blur-2xl" />

        {/* orbiting infinity ribbon */}
        <svg
          viewBox="0 0 400 400"
          className="orbit absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#B57BFF" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#5B2A9A" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#E2C48A" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path
            d="M120 200 C120 150 200 150 200 200 C200 250 280 250 280 200 C280 150 200 150 200 200 C200 250 120 250 120 200 Z"
            fill="none"
            stroke="url(#ribbon)"
            strokeWidth="2"
            opacity="0.7"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="170"
            ry="120"
            fill="none"
            stroke="var(--color-stroke)"
            strokeWidth="1"
          />
        </svg>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="sheen relative z-10 overflow-hidden rounded-3xl border border-[var(--color-stroke)]"
        >
          <Image
            src="/logo.jpeg"
            alt="InfiniteBucket logo"
            width={360}
            height={360}
            priority
            className="h-auto w-[62vw] max-w-[300px] select-none object-contain"
          />
        </motion.div>
      </div>
    </section>
  );
}
