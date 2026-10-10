import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play — Infinite Bucket",
};

const GAMES = [
  {
    href: "/play/drop",
    name: "Drop",
    tag: "Card duel",
    desc: "First to five Drops takes the match. Career wins on the board — daily plays scale with your bag.",
  },
  {
    href: "/play/match",
    name: "Match",
    tag: "Level run",
    desc: "Clear the board, climb the map. Free to play — cash rewards need 5M $INFINITY.",
  },
];

// /play — game picker. No wallet required to browse; each game decides what
// it needs (Drop gates scoring by balance, Match saves progress when signed
// in). Room for more cards — extend GAMES.
export default function PlayPicker() {
  return (
    <div className="mx-auto max-w-4xl py-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--color-amethyst)]">
        Play
      </p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)] sm:text-4xl">
        Pick a game
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Free to play. Connect a wallet to keep score and save progress.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="glass group relative flex flex-col gap-3 overflow-hidden rounded-xl p-6 transition hover:border-[var(--color-amethyst)]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-amethyst)]">
              {g.tag}
            </span>
            <span className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-white-soft)] transition group-hover:text-white">
              {g.name}
            </span>
            <span className="text-sm leading-relaxed text-[var(--color-muted)]">
              {g.desc}
            </span>
            <span className="mt-auto pt-2 font-mono text-xs text-[var(--color-amethyst)]">
              Play →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
