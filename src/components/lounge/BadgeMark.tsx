import type { LoungeBadgeWire } from "@/lib/lounge";

// Metal-tier mark — a small cut-gem diamond + uppercase label. Inline SVG,
// tier color comes from the live-balance badge computed server/client-side.
export function BadgeMark({ badge }: { badge: NonNullable<LoungeBadgeWire> }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${badge.name} tier — on-chain balance badge`}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z"
          fill={badge.color}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.6"
        />
        <path d="M5 2.4 L7.6 5 L5 7.6 L2.4 5 Z" fill="rgba(0,0,0,0.25)" />
      </svg>
      <span
        className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: badge.color }}
      >
        {badge.name}
      </span>
    </span>
  );
}
