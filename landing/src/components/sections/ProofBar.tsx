import { affiliationNotice, contestCategories, contestExamples } from "@/data/contests";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/animations/Reveal";

/** Tipos de preparação suportados. Exemplos de concursos, nunca parceiros — o aviso fica sempre visível. */
export function ProofBar() {
  const loop = [...contestExamples, ...contestExamples];

  return (
    <section aria-labelledby="proof-title" className="border-y border-line-soft bg-canvas-2 py-12 sm:py-14">
      <Container>
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className="lg:col-span-4">
            <h2 id="proof-title" className="text-lg font-semibold tracking-[-0.02em] text-fg">
              Uma plataforma para diferentes preparações
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-subtle">{affiliationNotice}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
            <ul className="flex flex-wrap gap-2" aria-label="Tipos de preparação">
              {contestCategories.map((c) => (
                <li key={c} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-fg-muted">
                  {c}
                </li>
              ))}
            </ul>

            <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <p className="sr-only">Exemplos de concursos: {contestExamples.join(", ")}.</p>
              <div aria-hidden className="flex w-max animate-marquee gap-10 py-1 group-hover:[animation-play-state:paused] motion-reduce:animate-none">
                {loop.map((name, i) => (
                  <span key={`${name}-${i}`} className="text-[0.9375rem] font-medium tracking-[-0.01em] whitespace-nowrap text-fg-subtle">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
