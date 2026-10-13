import { ArrowRight } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageIntro } from "@/components/layout/PageIntro";
import { ButtonLink } from "@/components/ui/Button";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { MentorSection } from "@/components/sections/MentorSection";
import { ErrorNotebookSection } from "@/components/sections/ErrorNotebookSection";
import { SimulationsSection } from "@/components/sections/SimulationsSection";
import { FinalCTA } from "@/components/sections/FinalCTA";

export default function ResourcesPage() {
  usePageMeta(ROUTES.features);

  return (
    <>
      <PageIntro
        title="Recursos do VÉRTICE"
        description="Tudo o que a preparação exige, ligado ao mesmo edital e à mesma rotina. Cada recurso alimenta o próximo plano."
      >
        <div className="mt-3">
          <ButtonLink to={ROUTES.signup} icon={<ArrowRight className="size-4" />}>
            Começar minha preparação
          </ButtonLink>
        </div>
      </PageIntro>
      <Features />
      <HowItWorks />
      <MentorSection />
      <ErrorNotebookSection />
      <SimulationsSection />
      <FinalCTA />
    </>
  );
}
