import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { comparison, problems } from "@/data/story";
import { fadeUp, stagger, viewport } from "@/animations/motion";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LogoMark } from "@/components/ui/Logo";

export function ProblemSection() {
  return (
    <Section aria-labelledby="problema-title">
      <SectionHeader
        id="problema-title"
        title="Estudar muito não significa estudar certo."
        description="A maior parte do tempo perdido não aparece como tempo perdido. Aparece como um cronograma que ninguém consegue seguir e revisões que nunca acontecem."
      />

      <motion.ul
        initial="hidden"
        whileInView="visible"
        viewport={viewport}
        variants={stagger(0.05)}
        className="mt-14 grid grid-cols-1 border-t border-line-soft sm:grid-cols-2 lg:mt-20 lg:grid-cols-4"
      >
        {problems.map((p) => (
          <motion.li
            key={p.title}
            variants={fadeUp}
            className="flex flex-col gap-2 border-b border-line-soft py-6 sm:odd:pr-6 lg:border-r lg:px-6 lg:py-8 lg:odd:pr-6 lg:[&:nth-child(4n)]:border-r-0 lg:[&:nth-child(4n+1)]:pl-0"
          >
            <h3 className="text-base font-medium text-fg">{p.title}</h3>
            <p className="text-sm leading-relaxed text-fg-subtle">{p.body}</p>
          </motion.li>
        ))}
      </motion.ul>

      <div className="mt-20 lg:mt-28">
        <div className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-window)] border border-line md:grid-cols-2">
          <div className="bg-canvas-2 p-6 sm:p-8 lg:p-10">
            <h3 className="flex items-center gap-2.5 text-sm font-medium text-fg-subtle">
              <span aria-hidden className="size-1.5 rounded-full bg-fg-faint" />
              Sem VÉRTICE
            </h3>
            <ul className="mt-6 flex flex-col">
              {comparison.map((row) => (
                <li key={row.without} className="flex items-center gap-3 border-b border-line-soft py-4 last:border-0 sm:py-5">
                  <X aria-hidden className="size-4 shrink-0 text-fg-faint" />
                  <span className="text-base text-fg-subtle sm:text-lg">{row.without}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative border-t border-line bg-elevated p-6 sm:p-8 md:border-t-0 md:border-l lg:p-10">
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-performance/0 via-performance/70 to-performance/0" />
            <h3 className="flex items-center gap-2.5 text-sm font-medium text-fg">
              <LogoMark className="size-4" />
              Com VÉRTICE
            </h3>
            <motion.ul initial="hidden" whileInView="visible" viewport={viewport} variants={stagger(0.09, 0.15)} className="mt-6 flex flex-col">
              {comparison.map((row) => (
                <motion.li
                  key={row.with}
                  variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } }}
                  className="flex items-center gap-3 border-b border-line py-4 last:border-0 sm:py-5"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-performance/15 text-performance">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-base font-medium text-fg sm:text-lg">{row.with}</span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
