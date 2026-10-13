import { ROUTES } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ContestsOverview } from "@/components/sections/ContestsOverview";
import { MilitarySection } from "@/components/sections/MilitarySection";
import { RoutineSection } from "@/components/sections/RoutineSection";
import { FinalCTA } from "@/components/sections/FinalCTA";

export default function ContestsPage() {
  usePageMeta(ROUTES.contests);

  return (
    <div className="pt-16">
      <ContestsOverview headingLevel="h1" />
      <MilitarySection />
      <RoutineSection />
      <FinalCTA />
    </div>
  );
}
