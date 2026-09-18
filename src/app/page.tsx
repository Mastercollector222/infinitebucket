import { Hero } from "@/components/Hero";
import { LiveStrip } from "@/components/LiveStrip";
import { FeeSplit } from "@/components/FeeSplit";
import { EngineStrip } from "@/components/EngineStrip";
import { LinksRow } from "@/components/LinksRow";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 pb-16 pt-6 sm:gap-14">
      {/* One hero */}
      <Hero />

      {/* One live stats row */}
      <LiveStrip />

      {/* One fee-split grid */}
      <FeeSplit />

      {/* One engine row — renders only while the indexer returns real data */}
      <EngineStrip />

      {/* One official-link row */}
      <LinksRow />
    </div>
  );
}
