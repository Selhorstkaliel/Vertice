import { ROUTES } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Pricing } from "@/components/sections/Pricing";
import { FAQ } from "@/components/sections/FAQ";

export default function PlansPage() {
  usePageMeta(ROUTES.plans);

  return (
    <div className="pt-16">
      <Pricing headingLevel="h1" />
      <FAQ />
    </div>
  );
}
