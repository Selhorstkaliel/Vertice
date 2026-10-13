import { CalendarClock, Check, CircleDot, Clock3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import { demoGoal, nextReview, subjects, todayPlan } from "@/data/demo";
import { DashboardWindow, Panel } from "@/components/ui/DashboardWindow";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";

export function HeroDashboard() {
  return (
    <DashboardWindow title="Painel" path="/painel" bodyClassName="grid gap-3 sm:gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <p className="text-[0.8125rem] text-fg-subtle">Objetivo principal</p>
          <p className="text-lg font-semibold tracking-[-0.02em] text-fg sm:text-xl">{demoGoal.contest}</p>
        </div>
        <Badge icon={<CalendarClock className="size-3.5" aria-hidden />}>
          Data-alvo em <span className="numeral text-fg">{demoGoal.daysToTarget}</span> dias
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-3 rounded-[14px] border border-line-soft bg-surface p-4 md:col-span-1">
          <span className="text-[0.8125rem] text-fg-subtle">Planejamento executado</span>
          <span className="numeral text-2xl font-semibold tracking-[-0.03em]">{demoGoal.planExecuted}%</span>
          <ProgressBar value={demoGoal.planExecuted} tone="performance" label="Planejamento executado" />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] border border-line-soft bg-surface p-4">
          <span className="text-[0.8125rem] text-fg-subtle">Horas na semana</span>
          <span className="numeral text-2xl font-semibold tracking-[-0.03em]">{formatMinutes(demoGoal.weekMinutes)}</span>
          <span className="text-xs text-fg-subtle">
            Meta de <span className="numeral">{formatMinutes(demoGoal.weekGoalMinutes)}</span>
          </span>
        </div>
        <MetricCard label="Questões respondidas" value={demoGoal.questions} hint="desde o início" />
        <MetricCard
          label="Acertos na semana"
          value={demoGoal.weekAccuracy}
          suffix="%"
          delta={{ value: "4 p.p.", direction: "up" }}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        <Panel
          title="Desempenho por matéria"
          aside={<span className="text-xs text-fg-subtle">Meta de {demoGoal.target}%</span>}
          className="lg:col-span-7"
        >
          <ul className="flex flex-col gap-4">
            {subjects.map((s) => {
              const below = s.accuracy < demoGoal.target;
              return (
                <li key={s.name} className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg">{s.name}</span>
                    <span className="flex items-center gap-2">
                      {below && <Badge tone="warning">Abaixo da meta</Badge>}
                      <span className="numeral w-9 text-right font-medium text-fg">{s.accuracy}%</span>
                    </span>
                  </div>
                  <ProgressBar value={s.accuracy} target={demoGoal.target} tone={below ? "warning" : "info"} label={`Acertos em ${s.name}`} />
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Plano de hoje" aside={<span className="text-xs text-fg-subtle">3 blocos</span>} className="lg:col-span-5">
          <ol className="flex flex-col">
            {todayPlan.map((item) => (
              <li key={item.time} className="flex gap-3 border-b border-line-soft py-2.5 first:pt-0 last:border-0 last:pb-0">
                <span className="numeral w-11 shrink-0 pt-px text-sm text-fg-subtle">{item.time}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-sm font-medium", item.status === "done" ? "text-fg-subtle line-through decoration-fg-faint" : "text-fg")}>
                    {item.subject} — {item.topic}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {item.kind} · {item.minutes}min
                  </span>
                  {item.why && <span className="mt-1 border-l-2 border-performance pl-2 text-xs text-fg-muted">Por quê: {item.why}</span>}
                </span>
                <span className="pt-0.5">
                  {item.status === "done" && (
                    <span className="grid size-5 place-items-center rounded-full bg-positive/15 text-positive">
                      <Check className="size-3" aria-hidden />
                      <span className="sr-only">Concluído</span>
                    </span>
                  )}
                  {item.status === "current" && (
                    <span className="grid size-5 place-items-center text-performance">
                      <CircleDot className="size-4" aria-hidden />
                      <span className="sr-only">Em andamento</span>
                    </span>
                  )}
                  {item.status === "next" && (
                    <span className="grid size-5 place-items-center text-fg-faint">
                      <Clock3 className="size-4" aria-hidden />
                      <span className="sr-only">A seguir</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border border-line-soft bg-canvas-2 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-xs text-fg-subtle">Próxima revisão</span>
              <span className="block truncate text-sm text-fg">
                {nextReview.subject} — {nextReview.topic}
              </span>
            </span>
            <span className="shrink-0 text-xs text-fg-muted">{nextReview.when}</span>
          </div>
        </Panel>
      </div>
    </DashboardWindow>
  );
}
