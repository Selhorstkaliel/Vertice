import { ROUTES } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Hero } from "@/components/sections/Hero";
import { ProofBar } from "@/components/sections/ProofBar";
import { ProblemSection } from "@/components/sections/ProblemSection";
import HomeSections from "@/pages/HomeSections";

export function HomePage() {
  usePageMeta(ROUTES.home);

  return (
    <>
      <Hero />
      <ProofBar />
      <ProblemSection />
      <HomeSections />
    </>
  );
}
