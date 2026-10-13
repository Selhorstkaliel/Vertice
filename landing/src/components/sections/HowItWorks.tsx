import { motion } from "framer-motion";
import { SECTIONS } from "@/lib/routes";
import { steps } from "@/data/story";
import { EASE, fadeUp, stagger, viewport } from "@/animations/motion";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function HowItWorks() {
  return (
    <Section id={SECTIONS.howItWorks} tone="raised" aria-labelledby="como-funciona-title">
      <SectionHeader
        id="como-funciona-title"
        title="Do edital ao dia da prova."
        description="Quatro etapas, e a última não termina: cada sessão registrada volta para o plano."
      />

      <div className="relative mt-14 lg:mt-20">
        {/* Linha de conexão: horizontal no desktop, vertical no mobile. */}
        <motion.div
          aria-hidden
          className="absolute top-[19px] right-[12.5%] left-[12.5%] hidden h-px origin-left bg-gradient-to-r from-performance via-line-strong to-line-strong lg:block"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewport}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />
        <motion.div
          aria-hidden
          className="absolute top-2 bottom-8 left-[19px] w-px origin-top bg-gradient-to-b from-performance via-line-strong to-line-strong lg:hidden"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={viewport}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />

        <motion.ol initial="hidden" whileInView="visible" viewport={viewport} variants={stagger(0.14, 0.1)} className="relative grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
          {steps.map((step, i) => (
            <motion.li key={step.title} variants={fadeUp} className="grid grid-cols-[40px_1fr] gap-5 lg:flex lg:flex-col lg:items-center lg:gap-6 lg:text-center">
              <span
                className={
                  i === 0
                    ? "numeral grid size-10 place-items-center rounded-full border border-performance bg-canvas text-sm font-semibold text-fg"
                    : "numeral grid size-10 place-items-center rounded-full border border-line-strong bg-canvas text-sm font-semibold text-fg-muted"
                }
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-3 lg:items-center">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-fg">{step.title}</h3>
                <p className="max-w-[30ch] text-[0.9375rem] leading-relaxed text-fg-muted">{step.body}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5 lg:justify-center" aria-label="O que entra nesta etapa">
                  {step.inputs.map((input) => (
                    <li key={input} className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs text-fg-subtle">
                      {input}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </Section>
  );
}
