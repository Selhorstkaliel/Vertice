import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes, formatNumber } from "@/lib/format";
import { consistencyGrid, dashboardByPeriod, pendingReviews, subjects, topicEvolution, type Period } from "@/data/demo";
import { EASE } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { Muted, SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DemoTag } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/MetricChart";
import { ProgressBar } from "@/components/ui/ProgressBar";

function Widget({ title, children, className, aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-[var(--radius-card)] border border-line-soft bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm text-fg-subtle">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Troca de valor com uma transição curta, para a mudança de período ficar perceptível. */
function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: EASE }}
        className={cn("block", className)}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

const heat = ["bg-white/[0.04]", "bg-info/30", "bg-info/60", "bg-info"];
const days = ["S", "T", "Q", "Q", "S", "S", "D"];

export function DashboardSection() {
  const [period, setPeriod] = useState<Period>("week");
  const d = dashboardByPeriod[period];
  const strong = subjects.filter((s) => s.accuracy >= 70);
  const critical = subjects.filter((s) => s.accuracy < 70);

  return (
    <Section tone="raised" aria-labelledby="dados-title">
      <SectionHeader
        id="dados-title"
        title={
          <>
            Menos achismo. <Muted>Mais dados.</Muted>
          </>
        }
        description="Tempo líquido, acertos, consistência e revisões: os números que mostram se a preparação está andando — e onde não está."
      />

      <Reveal className="mt-12 flex flex-wrap items-center justify-between gap-4 lg:mt-16">
        <SegmentedControl<Period>
          label="Período dos dados"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Semana" },
            { value: "month", label: "Mês" },
          ]}
        />
        <DemoTag />
      </Reveal>

      <Reveal delay={0.1} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">
        <Widget title="Tempo líquido estudado" className="sm:col-span-2 lg:col-span-4">
          <div className="flex flex-1 flex-col justify-between gap-6">
            <Swap id={`net-${period}`} className="numeral text-5xl font-semibold tracking-[-0.04em] text-fg">
              {formatMinutes(d.netMinutes)}
            </Swap>
            <div className="grid gap-2">
              <span className="flex justify-between text-xs text-fg-subtle">
                <span>Meta {period === "week" ? "semanal" : "mensal"}</span>
                <span className="numeral">
                  {Math.round((d.netMinutes / d.goalMinutes) * 100)}% de {formatMinutes(d.goalMinutes)}
                </span>
              </span>
              <ProgressBar key={period} value={d.netMinutes} max={d.goalMinutes} tone="performance" label="Tempo líquido em relação à meta" />
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="flex items-center gap-1.5 text-positive">
                <ArrowUpRight aria-hidden className="size-4" />
                <Swap id={`netd-${period}`}>{d.netDelta} em relação ao período anterior</Swap>
              </span>
              <span className="text-fg-subtle">Descontadas as pausas registradas nas sessões.</span>
            </div>
          </div>
        </Widget>

        <Widget
          title={d.hoursCaption}
          className="sm:col-span-2 lg:col-span-8"
          aside={<span className="text-xs text-fg-subtle">{period === "week" ? "Horas semanais" : "Últimas 4 semanas"}</span>}
        >
          <div className="h-48">
            <BarChart
              key={period}
              data={d.hours}
              format={formatMinutes}
              ariaLabel={`${d.hoursCaption}: ${d.hours.map((h) => `${h.label} ${formatMinutes(h.value)}`).join(", ")}`}
            />
          </div>
        </Widget>

        <Widget title="Taxa de acerto" className="lg:col-span-3">
          <Swap id={`acc-${period}`} className="numeral text-3xl font-semibold tracking-[-0.03em]">
            {d.accuracy}%
          </Swap>
          <span className="flex items-center gap-1 text-xs text-positive">
            <ArrowUpRight aria-hidden className="size-3.5" />
            {d.accuracyDelta}
          </span>
        </Widget>

        <Widget title="Questões respondidas" className="lg:col-span-3">
          <Swap id={`q-${period}`} className="numeral text-3xl font-semibold tracking-[-0.03em]">
            {formatNumber(d.questions)}
          </Swap>
          <span className="text-xs text-fg-subtle">{period === "week" ? "nesta semana" : "neste mês"}</span>
        </Widget>

        <Widget title="Metas cumpridas" className="lg:col-span-3">
          <Swap id={`g-${period}`} className="numeral text-3xl font-semibold tracking-[-0.03em]">
            {d.goals.done} <span className="text-lg text-fg-subtle">de {d.goals.total}</span>
          </Swap>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: d.goals.total }, (_, i) => (
              <span key={`${period}-${i}`} className={cn("h-1.5 flex-1 rounded-full", i < d.goals.done ? "bg-positive" : "bg-white/[0.08]")} />
            ))}
          </div>
        </Widget>

        <Widget title="Revisões pendentes" className="lg:col-span-3">
          <span className="numeral text-3xl font-semibold tracking-[-0.03em]">{pendingReviews.total}</span>
          <span className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert aria-hidden className="size-3.5" />
            {pendingReviews.overdue} atrasadas
          </span>
        </Widget>

        <Widget title="Matérias" className="sm:col-span-2 lg:col-span-4">
          {[
            { label: "Fortes", tone: "text-positive", items: strong, bar: "info" as const },
            { label: "Críticas", tone: "text-warning", items: critical, bar: "warning" as const },
          ].map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              <span className={cn("text-xs font-medium", group.tone)}>{group.label}</span>
              {group.items.map((s) => (
                <div key={s.name} className="grid gap-1.5">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-fg">{s.name}</span>
                    <span className="numeral text-fg-muted">{s.accuracy}%</span>
                  </span>
                  <ProgressBar value={s.accuracy} target={70} tone={group.bar} label={`Acertos em ${s.name}`} />
                </div>
              ))}
            </div>
          ))}
          <p className="mt-auto text-xs text-fg-subtle">Critério: meta de 70% de acertos, marcada em cada barra.</p>
        </Widget>

        <Widget title="Evolução por assunto" className="sm:col-span-2 lg:col-span-5">
          <ul className="flex flex-col">
            {topicEvolution.map((t) => {
              const first = t.values[0] ?? 0;
              const last = t.values.at(-1) ?? 0;
              const up = last >= first;
              return (
                <li key={t.topic} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line-soft py-2.5 first:pt-0 last:border-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{t.topic}</span>
                    <span className="block text-xs text-fg-subtle">{t.subject}</span>
                  </span>
                  <span className="numeral flex items-center gap-2 text-sm">
                    <span className="text-fg-subtle">{first}%</span>
                    <span aria-hidden className="text-fg-faint">→</span>
                    <span className="font-medium text-fg">{last}%</span>
                    <span className={cn("inline-flex w-16 items-center justify-end text-xs whitespace-nowrap", up ? "text-positive" : "text-danger")}>
                      {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
                      {Math.abs(last - first)} p.p.
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Widget>

        <Widget title="Consistência semanal" className="sm:col-span-2 lg:col-span-3">
          <div className="flex flex-col gap-3">
            <div
              className="grid w-max grid-cols-[repeat(7,16px)] gap-1.5"
              role="img"
              aria-label="Intensidade de estudo por dia nas últimas 8 semanas"
            >
              {days.map((day, i) => (
                <span key={i} aria-hidden className="text-center text-[0.625rem] text-fg-subtle">
                  {day}
                </span>
              ))}
              {consistencyGrid.flat().map((level, i) => (
                <span key={i} aria-hidden className={cn("size-4 rounded-[3px]", heat[level])} />
              ))}
            </div>
            <span className="text-[0.6875rem] text-fg-subtle">Últimas 8 semanas, de segunda a domingo</span>
            <Swap id={`c-${period}`} className="text-xs text-fg-muted">
              <span className="numeral text-fg">
                {d.consistency.done} de {d.consistency.total}
              </span>{" "}
              {d.consistency.label}
            </Swap>
          </div>
        </Widget>
      </Reveal>
    </Section>
  );
}
