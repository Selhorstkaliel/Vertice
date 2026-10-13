import { HowItWorks } from "@/components/sections/HowItWorks";
import { Features } from "@/components/sections/Features";
import { MentorSection } from "@/components/sections/MentorSection";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { DashboardSection } from "@/components/sections/DashboardSection";
import { RoutineSection } from "@/components/sections/RoutineSection";
import { ContestsOverview } from "@/components/sections/ContestsOverview";
import { MilitarySection } from "@/components/sections/MilitarySection";
import { ErrorNotebookSection } from "@/components/sections/ErrorNotebookSection";
import { SimulationsSection } from "@/components/sections/SimulationsSection";
import { PerformanceSection } from "@/components/sections/PerformanceSection";
import { Differential } from "@/components/sections/Differential";
import { Testimonials } from "@/components/sections/Testimonials";
import { Pricing } from "@/components/sections/Pricing";
import { FAQ } from "@/components/sections/FAQ";
import { FinalCTA } from "@/components/sections/FinalCTA";

/** Seções abaixo da dobra da página inicial, na ordem da narrativa. */
export default function HomeSections() {
  return (
    <>
      <HowItWorks />
      <Features />
      <MentorSection />
      <ProductShowcase />
      <DashboardSection />
      <RoutineSection />
      <ContestsOverview />
      <MilitarySection />
      <ErrorNotebookSection />
      <SimulationsSection />
      <PerformanceSection />
      <Differential />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </>
  );
}
