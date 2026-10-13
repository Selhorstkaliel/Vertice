import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/animations/Reveal";

/** Cabeçalho das páginas internas. */
export function PageIntro({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line-soft pt-32 pb-16 sm:pt-40 sm:pb-20">
      <div aria-hidden className="precision-grid pointer-events-none absolute inset-0 -z-10" />
      <Container>
        <Reveal className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-balance text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.04em] sm:text-6xl">{title}</h1>
          {description && <p className="max-w-2xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{description}</p>}
          {children}
        </Reveal>
      </Container>
    </section>
  );
}
