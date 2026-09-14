"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number | null;
  format: (n: number | null) => string;
  className?: string;
  durationMs?: number;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Counts up once on first real value, then just reflects live updates.
export function CountUp({ value, format, className = "", durationMs = 900 }: Props) {
  const [display, setDisplay] = useState<number | null>(value);
  const animatedOnce = useRef(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) {
      setDisplay(null);
      return;
    }
    if (animatedOnce.current || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    animatedOnce.current = true;
    const from = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
