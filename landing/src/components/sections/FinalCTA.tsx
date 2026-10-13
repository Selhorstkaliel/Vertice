import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { EASE, viewport } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

/** Vértice geométrico em escala: traços finos que convergem para um ponto abaixo do botão. */
function Apex() {
  return (
    <svg aria-hidden viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-0 size-full">
      <defs>
        <linearGradient id="cta-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5F7FA" stopOpacity="0" />
          <stop offset="100%" stopColor="#F5F7FA" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="cta-right" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E1062C" stopOpacity="0" />
          <stop offset="100%" stopColor="#E1062C" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={1 - i * 0.3}>
          <motion.path
            d={`M${120 + i * 110} ${-40} L600 ${720 - i * 26}`}
            stroke="url(#cta-left)"
            strokeWidth="1"
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={viewport}
            transition={{ duration: 1.8, ease: EASE, delay: i * 0.12 }}
          />
          <motion.path
            d={`M${1140 - i * 90} ${-120} L600 ${720 - i * 26}`}
            stroke="url(#cta-right)"
            strokeWidth="1"
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={viewport}
            transition={{ duration: 1.8, ease: EASE, delay: 0.1 + i * 0.12 }}
          />
        </g>
      ))}
    </svg>
  );
}

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-line-soft bg-[#06070a]">
      <div aria-hidden className="precision-grid absolute inset-0 -z-10 opacity-60" />
      {/* Máscara abre um vazio atrás do texto: as linhas convergem sem atravessar a leitura. */}
      <div className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_42%_46%_at_50%_44%,transparent_55%,black_100%)]">
        <Apex />
      </div>
      <Container className="flex flex-col items-center py-28 text-center sm:py-36 lg:py-44">
        <Reveal className="flex flex-col items-center">
          <h2 id="cta-title" className="max-w-5xl text-balance text-[2.375rem] leading-[1.04] font-semibold tracking-[-0.04em] sm:text-6xl lg:text-[4.25rem]">
            Você já sabe onde quer chegar. <span className="text-fg-subtle">Agora construa o caminho.</span>
          </h2>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Organize sua preparação, acompanhe sua evolução e concentre seu esforço no que realmente importa.
          </p>
          <ButtonLink to={ROUTES.signup} size="lg" className="mt-10" icon={<ArrowRight className="size-4" />}>
            Começar no VÉRTICE
          </ButtonLink>
        </Reveal>
      </Container>
    </section>
  );
}
