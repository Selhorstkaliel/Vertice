import { SECTIONS } from "@/lib/routes";
import { affiliationNotice, contestGroups, dataStatuses } from "@/data/contests";
import { Reveal, RevealGroup, RevealItem } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";

export function ContestsOverview({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  return (
    <Section id={SECTIONS.contests} aria-labelledby="concursos-title">
      <SectionHeader
        id="concursos-title"
        as={headingLevel}
        title="O seu concurso, com os dados do seu edital."
        description="Comece por um concurso do catálogo ou monte o seu. Disciplinas, tópicos e pesos podem ser ajustados ao edital oficial."
      />

      <RevealGroup gap={0.05} className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-window)] border border-line bg-line sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
        {contestGroups.map((g) => (
          <RevealItem key={g.category} className="flex flex-col gap-3 bg-canvas-2 p-5 sm:p-6">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-fg">{g.category}</h3>
            <p className="text-sm leading-relaxed text-fg-subtle">{g.body}</p>
            {g.examples.length > 0 && (
              <ul className="mt-auto flex flex-wrap gap-1.5 pt-2" aria-label={`Exemplos em ${g.category}`}>
                {g.examples.map((e) => (
                  <li key={e} className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs text-fg-muted">
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </RevealItem>
        ))}
        <RevealItem className="flex flex-col justify-center gap-2 bg-canvas-2 p-5 sm:p-6">
          <p className="text-base font-semibold tracking-[-0.01em] text-fg">Outro concurso</p>
          <p className="text-sm leading-relaxed text-fg-subtle">Cadastre as disciplinas e os tópicos do edital e siga com o mesmo planejamento.</p>
        </RevealItem>
      </RevealGroup>

      <Reveal className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h3 className="text-sm font-medium text-fg">Situação dos dados</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-subtle">Cada concurso mostra de onde vêm as informações. Nada é preenchido por suposição.</p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-8">
          {dataStatuses.map((s) => (
            <li key={s.label} className="flex flex-col items-start gap-2">
              <Badge tone={s.tone}>{s.label}</Badge>
              <p className="text-sm leading-relaxed text-fg-subtle">{s.body}</p>
            </li>
          ))}
        </ul>
      </Reveal>
      <p className="mt-10 border-t border-line-soft pt-6 text-xs leading-relaxed text-fg-subtle">{affiliationNotice}</p>
    </Section>
  );
}
