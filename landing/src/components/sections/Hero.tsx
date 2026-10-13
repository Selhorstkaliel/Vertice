import { useRef, type CSSProperties } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ROUTES, SECTIONS, sectionHref } from "@/lib/routes";
import { EASE } from "@/animations/motion";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { HeroDashboard } from "@/components/mockups/HeroDashboard";

const audiences = ["Concursos públicos", "Militares", "Bancários", "Policiais", "Fiscais", "Empresas públicas"];

/** A entrada do hero é feita em CSS: o texto é pintado no primeiro quadro, sem esperar o JavaScript. */
const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` });

/** A geometria da marca em escala: dois traços que convergem num vértice. Desenhada uma vez, na entrada. */
function VertexLines() {
  // Área fixa de 600px acima da prévia do painel: o vértice nunca fica atrás da janela.
  const apex = { x: 88, y: 96 };
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[600px] [mask-image:linear-gradient(to_right,transparent_66%,black_92%)]"
    >
      <motion.svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        initial={{ clipPath: "inset(100% 0 0 0)" }}
        animate={{ clipPath: "inset(0% 0 0 0)" }}
        transition={{ duration: 1.6, ease: EASE, delay: 0.25 }}
      >
        <defs>
          <linearGradient id="hero-rise" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#E1062C" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#E1062C" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hero-fall" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#F5F7FA" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#F5F7FA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M${apex.x} ${apex.y} L70 0`} stroke="url(#hero-fall)" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
        <path d={`M${apex.x} ${apex.y} L100 -8`} stroke="url(#hero-rise)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" fill="none" />
      </motion.svg>
      <span
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 animate-rise rounded-full bg-performance shadow-[0_0_0_4px_rgb(225_6_44/0.15)]"
        style={{ left: `${apex.x}%`, top: `${apex.y}%`, animationDelay: "1200ms" }}
      />
    </div>
  );
}

export function Hero() {
  const previewRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: previewRef, offset: ["start end", "start 20%"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.94, 1]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, 0]);

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 lg:pt-44 lg:pb-28">
      <div aria-hidden className="precision-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 hidden lg:block">
        <VertexLines />
      </div>

      <Container>
        <div className="flex flex-col items-start">
          <h1
            id="hero-title"
            style={rise(100)}
            className="animate-rise text-balance text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-[3.25rem] sm:leading-[1] lg:text-[3.875rem] xl:text-[4.75rem]"
          >
            Seu estudo precisa de <span className="text-performance">estratégia</span>.
            <br className="hidden sm:block" /> Não de mais horas perdidas.
          </h1>

          <p
            style={rise(220)}
            className="mt-6 max-w-[620px] animate-rise text-pretty text-base leading-relaxed text-fg-muted sm:mt-8 sm:text-lg lg:text-xl lg:leading-relaxed"
          >
            O VÉRTICE transforma seu edital, sua rotina e seu desempenho em um plano de estudos adaptativo para você saber exatamente onde concentrar
            seu esforço.
          </p>

          <div style={rise(340)} className="mt-9 flex w-full animate-rise flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink to={ROUTES.signup} size="lg" icon={<ArrowRight className="size-4" />}>
              Começar minha preparação
            </ButtonLink>
            <ButtonLink to={sectionHref(SECTIONS.features)} variant="outline" size="lg">
              Conhecer a plataforma
            </ButtonLink>
          </div>

          <p style={rise(460)} className="mt-8 flex animate-rise flex-wrap gap-x-2.5 gap-y-1 text-sm text-fg-subtle">
            {audiences.map((a, i) => (
              <span key={a} className="inline-flex items-center gap-2.5">
                {i > 0 && <span aria-hidden className="text-fg-faint">•</span>}
                {a}
              </span>
            ))}
          </p>
        </div>

        <div ref={previewRef} style={rise(580)} className="relative mt-16 animate-rise [perspective:1800px] sm:mt-20">
          <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="will-change-transform">
            <HeroDashboard />
          </motion.div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-32 bg-gradient-to-t from-canvas to-transparent" />
        </div>
      </Container>
    </section>
  );
}
