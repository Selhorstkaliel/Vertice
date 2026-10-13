import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROUTES, SECTIONS } from "@/lib/routes";
import { formatPrice, plans, pricingConfig, type BillingCycle, type Plan } from "@/data/pricing";
import { EASE } from "@/animations/motion";
import { Reveal, RevealGroup, RevealItem } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ButtonLink } from "@/components/ui/Button";

function PriceTag({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const value = plan.price[cycle];
  return (
    <div className="flex h-14 items-end">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${cycle}-${value ?? "soon"}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="flex items-baseline gap-1.5"
        >
          {value === null ? (
            <span className="text-3xl font-semibold tracking-[-0.03em] text-fg">Em breve</span>
          ) : (
            <>
              <span className="numeral text-4xl font-semibold tracking-[-0.04em] text-fg">{formatPrice(value)}</span>
              <span className="text-sm text-fg-subtle">{cycle === "monthly" ? "/mês" : "/ano"}</span>
            </>
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function PricingCard({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const featured = plan.highlighted;
  return (
    <article
      aria-labelledby={`plano-${plan.id}`}
      className={cn(
        "relative flex h-full flex-col gap-7 rounded-[var(--radius-window)] border p-6 transition-[transform,border-color] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-1 sm:p-8",
        featured ? "border-performance/50 bg-elevated hover:border-performance/80" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      {featured && <div aria-hidden className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-performance to-transparent" />}
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`plano-${plan.id}`} className="text-lg font-semibold tracking-[-0.02em] text-fg">
            {plan.name}
          </h3>
          {featured && <span className="rounded-full bg-performance/15 px-2.5 py-0.5 text-xs font-medium text-[#ff6680]">Recomendado</span>}
        </div>
        <p className="text-sm text-fg-muted">{plan.summary}</p>
      </header>

      <PriceTag plan={plan} cycle={cycle} />

      <ul className="flex flex-col gap-3 border-t border-line-soft pt-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-fg-muted">
            <Check aria-hidden className={cn("mt-0.5 size-4 shrink-0", featured ? "text-performance" : "text-fg-subtle")} strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <ButtonLink to={ROUTES.signup} variant={featured ? "primary" : "secondary"} className="mt-auto w-full">
        {plan.price[cycle] === null ? "Criar conta" : `Assinar ${plan.name.replace("VÉRTICE ", "")}`}
      </ButtonLink>
    </article>
  );
}

export function Pricing({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <Section id={SECTIONS.plans} aria-labelledby="planos-title">
      <SectionHeader
        id="planos-title"
        as={headingLevel}
        title="Escolha como você quer evoluir."
        description="Três formas de usar o VÉRTICE, da organização básica à preparação completa com área militar."
      />

      <Reveal delay={0.1} className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mt-16">
        {/* Sem valores publicados, o alternador de cobrança não mudaria nada — então ele só aparece depois. */}
        {pricingConfig.published ? (
          <SegmentedControl<BillingCycle>
            label="Ciclo de cobrança"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: "Mensal" },
              { value: "yearly", label: "Anual", hint: pricingConfig.yearlyNote ?? undefined },
            ]}
          />
        ) : (
          <p role="note" className="flex items-start gap-2 text-sm text-fg-muted sm:max-w-xl">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            {pricingConfig.draftNotice}
          </p>
        )}
      </Reveal>

      <RevealGroup gap={0.1} className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <RevealItem key={plan.id} className={cn(plan.highlighted && "lg:-my-3")}>
            <PricingCard plan={plan} cycle={cycle} />
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
