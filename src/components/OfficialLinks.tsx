import { LINKS, SOCIALS } from "@/lib/constants";

const OFFICIAL = [
  { label: "Bucket Shop", desc: "Launch / trade", href: LINKS.launch },
  { label: "GeckoTerminal", desc: "Live pool", href: LINKS.geckoterminal },
  { label: "Robinscanner", desc: "Token scanner", href: LINKS.robinscanner },
  { label: "Blockscout", desc: "Explorer", href: LINKS.blockscoutToken },
];

// Section G: official links only. Social slots are placeholders until env
// vars are provided — never link to unverified handles.
export function OfficialLinks() {
  return (
    <section className="py-4">
      <div className="mb-8 max-w-2xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Official <span className="text-chrome">links</span>
        </h2>
        <p className="mt-3 text-[var(--color-muted)]">
          Only verified destinations. Social channels appear once configured.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OFFICIAL.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="glass group flex items-center justify-between p-5 transition hover:border-[rgba(196,160,255,0.35)]"
          >
            <div>
              <div className="font-display font-bold text-[var(--color-white-soft)]">
                {l.label}
              </div>
              <div className="text-sm text-[var(--color-muted)]">{l.desc}</div>
            </div>
            <span className="text-[var(--color-amethyst)] transition group-hover:translate-x-0.5">
              ↗
            </span>
          </a>
        ))}

        <SocialSlot label="X" url={SOCIALS.x} />
        <SocialSlot label="Telegram" url={SOCIALS.telegram} />
      </div>
    </section>
  );
}

function SocialSlot({ label, url }: { label: string; url: string }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="glass group flex items-center justify-between p-5 transition hover:border-[rgba(196,160,255,0.35)]"
      >
        <div className="font-display font-bold text-[var(--color-white-soft)]">{label}</div>
        <span className="text-[var(--color-amethyst)]">↗</span>
      </a>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-dashed border-[var(--color-stroke)] p-5 opacity-70">
      <div className="text-[var(--color-muted)]">Add {label}</div>
      <span className="text-xs text-[var(--color-muted)]">coming soon</span>
    </div>
  );
}
