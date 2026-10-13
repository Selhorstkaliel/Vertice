import { testimonials } from "@/data/testimonials";
import { Reveal, RevealGroup, RevealItem } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * Depoimentos só com relatos verificados (src/data/testimonials.ts).
 * Lista vazia: some em produção e mostra o estado preparado em desenvolvimento.
 */
export function Testimonials() {
  if (!testimonials.length && import.meta.env.PROD) return null;

  return (
    <Section aria-labelledby="depoimentos-title">
      <SectionHeader id="depoimentos-title" title="Quem usa o VÉRTICE." layout="stacked" />

      {testimonials.length ? (
        <RevealGroup className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <RevealItem key={t.id}>
              <figure className="flex h-full flex-col justify-between gap-8 rounded-[var(--radius-card)] border border-line-soft bg-surface p-6">
                <blockquote className="text-base leading-relaxed text-fg">“{t.quote}”</blockquote>
                <figcaption className="text-sm">
                  <span className="block font-medium text-fg">{t.author}</span>
                  {t.context && <span className="block text-fg-subtle">{t.context}</span>}
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealGroup>
      ) : (
        <Reveal className="mt-12 rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-sm leading-relaxed text-fg-muted">
          <p className="font-medium text-fg">Seção oculta em produção</p>
          <p className="mt-2 max-w-2xl">
            Nenhum depoimento verificado cadastrado. Adicione relatos reais, com autorização registrada, em <code className="text-fg">src/data/testimonials.ts</code>{" "}
            para exibir esta seção.
          </p>
        </Reveal>
      )}
    </Section>
  );
}
