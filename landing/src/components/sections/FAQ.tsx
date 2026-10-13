import { SECTIONS } from "@/lib/routes";
import { faq } from "@/data/faq";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { Accordion } from "@/components/ui/Accordion";

export function FAQ() {
  return (
    <Section id={SECTIONS.faq} tone="raised" aria-labelledby="faq-title">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="flex flex-col gap-4 lg:col-span-4">
          <h2 id="faq-title" className="text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-5xl">
            Perguntas frequentes
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-fg-muted">O que o VÉRTICE faz, para quem serve e o que ele não promete.</p>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-8">
          <Accordion
            defaultOpen={faq[0]?.id}
            items={faq.map((item) => ({
              id: item.id,
              question: item.question,
              answer: (
                <div className="flex flex-col gap-3">
                  {item.answer.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              ),
            }))}
          />
        </Reveal>
      </div>
    </Section>
  );
}
