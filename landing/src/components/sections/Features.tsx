import type { ComponentType, ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CalendarRange, ChartLine, Dumbbell, ListChecks, ListTree, NotebookPen, SquareStack, Timer, type LucideProps } from "lucide-react";
import { cn } from "@/lib/cn";
import { SECTIONS } from "@/lib/routes";
import { fadeUp, stagger } from "@/animations/motion";
import { Section } from "@/components/ui/Section";
import { Muted, SectionHeader } from "@/components/ui/SectionHeader";
import { DemoTag } from "@/components/ui/Badge";
import {
  CalendarMini,
  EditalMini,
  ErrorsMini,
  FlashcardMini,
  PerformanceMini,
  QuestionFiltersMini,
  SimulationMini,
  TafMini,
  WeekAgendaMini,
} from "@/components/mockups/FeatureMinis";

type Feature = {
  title: string;
  body: string;
  icon: ComponentType<LucideProps>;
  preview: ReactNode;
  /** Classes de posição no grid de 12 colunas. */
  span: string;
};

const features: Feature[] = [
  {
    title: "Edital verticalizado",
    body: "Disciplinas e tópicos com peso, prioridade e progresso. Você vê o que falta, não só o que já foi.",
    icon: ListTree,
    preview: <EditalMini />,
    span: "md:col-span-6 lg:col-span-5 lg:row-span-2",
  },
  {
    title: "Plano adaptativo",
    body: "Uma agenda semanal montada no tempo que você tem, com teoria, questões, revisões e simulados.",
    icon: CalendarRange,
    preview: <WeekAgendaMini />,
    span: "md:col-span-6 lg:col-span-7",
  },
  {
    title: "Banco de questões",
    body: "Filtre por banca, matéria, assunto, dificuldade e concurso.",
    icon: ListChecks,
    preview: <QuestionFiltersMini />,
    span: "md:col-span-6 lg:col-span-4",
  },
  {
    title: "Flashcards",
    body: "Repetição espaçada com intervalo calculado para cada cartão.",
    icon: SquareStack,
    preview: <FlashcardMini />,
    span: "md:col-span-6 lg:col-span-3",
  },
  {
    title: "Caderno de erros",
    body: "Erros recorrentes e os assuntos que precisam de reforço.",
    icon: NotebookPen,
    preview: <ErrorsMini />,
    span: "md:col-span-6 lg:col-span-4",
  },
  {
    title: "Simulados",
    body: "Provas completas ou personalizadas, com tempo de prova.",
    icon: Timer,
    preview: <SimulationMini />,
    span: "md:col-span-6 lg:col-span-4",
  },
  {
    title: "Performance",
    body: "Gráficos de evolução por semana, matéria e assunto.",
    icon: ChartLine,
    preview: <PerformanceMini />,
    span: "md:col-span-6 lg:col-span-4",
  },
  {
    title: "Calendário",
    body: "Estudo, revisões, simulados e provas em um único lugar.",
    icon: CalendarDays,
    preview: <CalendarMini />,
    span: "md:col-span-6 lg:col-span-5",
  },
  {
    title: "TAF",
    body: "Para concursos militares e policiais: corrida, flexões, abdominais e barra, com metas e evolução.",
    icon: Dumbbell,
    preview: <TafMini />,
    span: "md:col-span-12 lg:col-span-7",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <motion.article
      variants={fadeUp}
      className={cn(
        "group flex flex-col gap-6 rounded-[var(--radius-card)] border border-line-soft bg-surface p-5 transition-[transform,border-color,background-color] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:border-line-strong hover:bg-elevated sm:p-6",
        feature.span,
      )}
    >
      <header className="flex flex-col gap-3">
        <span className="grid size-9 place-items-center rounded-[10px] border border-line bg-canvas-2 text-fg-muted transition-colors duration-300 group-hover:border-performance/40 group-hover:text-fg">
          <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-fg">{feature.title}</h3>
          <p className="max-w-[46ch] text-sm leading-relaxed text-fg-muted">{feature.body}</p>
        </div>
      </header>
      <div className="lg:mt-auto">{feature.preview}</div>
    </motion.article>
  );
}

export function Features() {
  return (
    <Section id={SECTIONS.features} aria-labelledby="recursos-title">
      <SectionHeader
        id="recursos-title"
        title={
          <>
            Tudo que sua preparação precisa. <Muted>No mesmo sistema.</Muted>
          </>
        }
        description="Cada recurso alimenta os outros: um erro vira flashcard, um simulado ajusta prioridades, uma semana difícil muda o próximo plano."
      />
      <div className="mt-6 flex lg:mt-8">
        <DemoTag label="Telas com dados demonstrativos" />
      </div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "0px 0px -5% 0px" }}
        variants={stagger(0.06)}
        className="mt-10 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12 lg:mt-14"
      >
        {features.map((f) => (
          <FeatureCard key={f.title} feature={f} />
        ))}
      </motion.div>
    </Section>
  );
}
