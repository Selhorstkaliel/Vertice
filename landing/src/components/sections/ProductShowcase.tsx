import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/cn";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DashboardScreen, EditalScreen, PerformanceScreen, WeekPlanScreen } from "@/components/mockups/AppScreens";

const screens: { id: string; title: string; body: string; screen: ReactNode }[] = [
  {
    id: "painel",
    title: "Painel",
    body: "O estado da preparação em uma tela: plano executado, horas, acertos e o que vem a seguir.",
    screen: <DashboardScreen />,
  },
  {
    id: "plano",
    title: "Planejamento semanal",
    body: "Os blocos da semana dentro dos horários que você informou, com o tipo de cada sessão.",
    screen: <WeekPlanScreen />,
  },
  {
    id: "desempenho",
    title: "Desempenho",
    body: "Evolução por semana e por assunto, com a meta sempre visível para comparação.",
    screen: <PerformanceScreen />,
  },
  {
    id: "edital",
    title: "Edital verticalizado",
    body: "Cada disciplina aberta em tópicos, com peso, prioridade e situação de estudo.",
    screen: <EditalScreen />,
  },
];

function ShowcaseItem({ index, onActive, children }: { index: number; onActive: (i: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.55 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 35%"] });
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.96, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], reduce ? [1, 1] : [0.35, 1]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [48, 0]);

  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  return (
    <motion.div ref={ref} style={{ scale, opacity, y }} className="origin-top will-change-transform">
      {children}
    </motion.div>
  );
}

export function ProductShowcase() {
  const [active, setActive] = useState(0);

  return (
    <Section aria-labelledby="showcase-title">
      <SectionHeader
        id="showcase-title"
        title="Veja sua preparação inteira."
        description="Painel, plano, desempenho e edital são telas do mesmo sistema, lendo os mesmos dados."
      />

      <div className="mt-14 grid grid-cols-1 gap-10 lg:mt-20 lg:grid-cols-12 lg:gap-12">
        <nav aria-label="Telas da plataforma" className="hidden lg:col-span-3 lg:block">
          <ol className="sticky top-32 flex flex-col">
            {screens.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#tela-${s.id}`}
                  aria-current={active === i ? "step" : undefined}
                  className={cn(
                    "relative flex flex-col gap-1.5 border-l py-4 pl-5 transition-colors duration-300",
                    active === i ? "border-performance" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className={cn("text-base font-medium transition-colors", active === i ? "text-fg" : "text-fg-subtle")}>{s.title}</span>
                  <span
                    className={cn(
                      "grid text-sm leading-relaxed text-fg-muted transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-out-soft)]",
                      active === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <span className="overflow-hidden">{s.body}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-16 lg:col-span-9 lg:gap-24">
          {screens.map((s, i) => (
            <div key={s.id} id={`tela-${s.id}`} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5 lg:hidden">
                <h3 className="text-xl font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-fg-muted">{s.body}</p>
              </div>
              <ShowcaseItem index={i} onActive={setActive}>
                {s.screen}
              </ShowcaseItem>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
