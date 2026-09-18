import { LiveStrip } from "@/components/LiveStrip";
import { Hero } from "@/components/Hero";
import { FeeSplit } from "@/components/FeeSplit";
import { FactsRow } from "@/components/FactsRow";
import { LinksRow } from "@/components/LinksRow";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 pb-16 pt-6 sm:gap-14">
      {/* Single live stats bar under the header */}
      <LiveStrip />

      {/* One hero */}
      <Hero />

      {/* One fee-split grid */}
      <FeeSplit />

      {/* One facts row */}
      <FactsRow />

      {/* One official-link row */}
      <LinksRow />
    </div>
  );
}
