import { Hero } from "@/components/Hero";
import { LiveStrip } from "@/components/LiveStrip";
import { TradeTape } from "@/components/TradeTape";
import { Mechanism } from "@/components/Mechanism";
import { EngineStrip } from "@/components/EngineStrip";
import { TokenFacts } from "@/components/TokenFacts";
import { OfficialLinks } from "@/components/OfficialLinks";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 pb-28 sm:gap-20 lg:pb-16">
      {/* B. Hero */}
      <Hero />

      {/* C. Live strip */}
      <LiveStrip />

      {/* D. Trade tape */}
      <TradeTape limit={12} />

      {/* E. Mechanism */}
      <Mechanism />

      {/* E2. Engine — live burn + payouts */}
      <EngineStrip />

      {/* F. Token facts */}
      <TokenFacts />

      {/* G. Official links */}
      <OfficialLinks />
    </div>
  );
}
