import type { CSSProperties, ReactNode } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChartLine,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  ListTree,
  NotebookPen,
  SquareStack,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import { availability, demoGoal, editalDemo, subjects, topicEvolution, weeklyAccuracy, type TopicStatus } from "@/data/demo";
import { buildDemoPlan } from "@/lib/plan";
import { LogoMark } from "@/components/ui/Logo";
import { DemoTag } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LineChart, Sparkline } from "@/components/ui/MetricChart";

const nav = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "plano", label: "Plano", icon: CalendarRange },
  { id: "edital", label: "Edital", icon: ListTree },
  { id: "questoes", label: "Questões", icon: ListChecks },
  { id: "flashcards", label: "Flashcards", icon: SquareStack },
  { id: "erros", label: "Caderno de erros", icon: NotebookPen },
  { id: "simulados", label: "Simulados", icon: Timer },
  { id: "desempenho", label: "Desempenho", icon: ChartLine },
  { id: "calendario", label: "Calendário", icon: CalendarDays },
] as const;

export type ScreenId = (typeof nav)[number]["id"];

/** Moldura com barra lateral, para as telas parecerem o aplicativo inteiro. */
export function AppShell({ active, title, children }: { active: ScreenId; title: string; children: ReactNode }) {
  return (
    <div className="flex overflow-hidden rounded-[var(--radius-window)] border border-line bg-canvas-2 shadow-[0_50px_100px_-40px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.04)]">
      <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line-soft p-3 md:flex" aria-hidden>
        <div className="flex items-center gap-2 px-2 pt-1 pb-4">
          <LogoMark className="size-4 text-fg" />
          <span className="text-xs font-semibold tracking-[0.16em] text-fg">VÉRTICE</span>
        </div>
        {nav.map((item) => {
          const Icon = item.icon;
          const on = item.id === active;
          return (
            <span
              key={item.id}
              className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem]", on ? "bg-elevated text-fg" : "text-fg-subtle")}
            >
              <Icon className={cn("size-4", on && "text-performance")} strokeWidth={1.75} />
              {item.label}
            </span>
          );
        })}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-line-soft px-4 sm:px-5">
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-fg">
            <LogoMark className="size-4 shrink-0 md:hidden" />
            <span className="truncate">{title}</span>
          </span>
          <DemoTag />
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, children, className }: { label: string; value?: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[12px] border border-line-soft bg-surface p-3.5", className)}>
      <span className="text-xs text-fg-subtle">{label}</span>
      {value && <span className="numeral text-xl font-semibold tracking-[-0.02em] text-fg">{value}</span>}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {children}
    </div>
  );
}

export function DashboardScreen() {
  return (
    <AppShell active="painel" title="Painel">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Planejamento executado" value={`${demoGoal.planExecuted}%`}>
            <ProgressBar value={demoGoal.planExecuted} tone="performance" label="Planejamento executado" className="mt-1" />
          </Tile>
          <Tile label="Horas na semana" value={formatMinutes(demoGoal.weekMinutes)} hint={`Meta de ${formatMinutes(demoGoal.weekGoalMinutes)}`} />
          <Tile label="Questões" value={demoGoal.questions.toLocaleString("pt-BR")} hint="desde o início" />
          <Tile label="Acertos na semana" value={`${demoGoal.weekAccuracy}%`} hint={<span className="text-positive">+4 p.p.</span>} />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="rounded-[12px] border border-line-soft bg-surface p-4 lg:col-span-3">
            <p className="mb-4 text-xs text-fg-subtle">Acertos por semana</p>
            <LineChart data={weeklyAccuracy.map((w, i) => ({ label: `S${i + 1}`, value: w.value }))} min={40} max={90} target={{ value: 70, label: "Meta 70%" }} className="h-40" ariaLabel="Acertos por semana, de 58% a 78%" />
          </div>
          <div className="flex flex-col gap-3 rounded-[12px] border border-line-soft bg-surface p-4 lg:col-span-2">
            <p className="text-xs text-fg-subtle">Por matéria</p>
            {subjects.map((s) => (
              <div key={s.name} className="grid gap-1.5">
                <span className="flex justify-between text-xs">
                  <span className="text-fg-muted">{s.name}</span>
                  <span className="numeral text-fg">{s.accuracy}%</span>
                </span>
                <ProgressBar value={s.accuracy} target={70} tone={s.accuracy < 70 ? "warning" : "info"} label={`Acertos em ${s.name}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const kindTone: Record<string, string> = {
  Teoria: "border-info/40 bg-info/15",
  Questões: "border-positive/35 bg-positive/10",
  Flashcards: "border-warning/35 bg-warning/10",
};

export function WeekPlanScreen() {
  const enabled = Object.fromEntries(availability.map((d) => [d.id, Boolean(d.from)]));
  const plan = buildDemoPlan(availability, enabled);
  // Dias livres ficam estreitos para sobrar espaço aos dias com estudo.
  const columns = plan.map((p) => (p.blocks.length ? "minmax(0,1fr)" : "44px")).join(" ");
  return (
    <AppShell active="plano" title="Plano da semana">
      <div className="grid grid-cols-2 gap-2 sm:[grid-template-columns:var(--cols)]" style={{ "--cols": columns } as CSSProperties}>
        {plan.map(({ day, blocks }) => (
          <div key={day.id} className={cn("flex min-w-0 flex-col gap-1.5", !blocks.length && "hidden sm:flex")}>
            <span className="flex items-baseline justify-between px-0.5 text-xs">
              <span className="text-fg-muted">{day.short}</span>
              {blocks.length > 0 && <span className="numeral text-[0.625rem] text-fg-subtle">{day.from}</span>}
            </span>
            <div className="flex min-h-56 flex-col gap-1.5 rounded-[10px] border border-line-soft bg-surface p-1.5">
              {blocks.map((b) => (
                <span key={b.start} className={cn("rounded-md border px-2 py-1.5", kindTone[b.kind] ?? "border-line bg-elevated")}>
                  <span className="block truncate text-xs font-medium text-fg">{b.subject}</span>
                  <span className="numeral block truncate text-[0.6875rem] text-fg-muted">
                    {b.start} · {b.kind}
                  </span>
                </span>
              ))}
              {!blocks.length && <span className="m-auto text-[0.625rem] text-fg-faint [writing-mode:vertical-rl]">Livre</span>}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function PerformanceScreen() {
  return (
    <AppShell active="desempenho" title="Desempenho">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="rounded-[12px] border border-line-soft bg-surface p-4 lg:col-span-3">
          <p className="mb-5 text-xs text-fg-subtle">Evolução de acertos</p>
          <LineChart data={weeklyAccuracy.map((w, i) => ({ label: `Sem. ${i + 1}`, value: w.value }))} min={40} max={90} target={{ value: 70, label: "Meta 70%" }} className="h-52" ariaLabel="Evolução de acertos por semana" />
        </div>
        <div className="rounded-[12px] border border-line-soft bg-surface p-4 lg:col-span-2">
          <p className="mb-3 text-xs text-fg-subtle">Por assunto, últimas 4 semanas</p>
          <table className="w-full text-left text-xs">
            <thead className="sr-only">
              <tr>
                <th>Assunto</th>
                <th>Tendência</th>
                <th>Atual</th>
              </tr>
            </thead>
            <tbody>
              {topicEvolution.map((t) => (
                <tr key={t.topic} className="border-b border-line-soft last:border-0">
                  <td className="py-2.5 pr-2">
                    <span className="block text-fg">{t.topic}</span>
                    <span className="block text-fg-subtle">{t.subject}</span>
                  </td>
                  <td className="py-2.5">
                    <Sparkline values={t.values} tone={t.tone} className="h-5 w-12" />
                  </td>
                  <td className={cn("numeral py-2.5 text-right font-medium", t.tone === "danger" ? "text-danger" : "text-fg")}>{t.values.at(-1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

const statusIcon: Record<TopicStatus, ReactNode> = {
  Revisado: <Check className="size-3 text-positive" strokeWidth={3} />,
  Estudado: <span className="size-2 rounded-full bg-info" />,
  "Em andamento": <span className="size-2 rounded-full border-2 border-warning" />,
  "Não iniciado": <span className="size-2 rounded-full border border-fg-faint" />,
};

export function EditalScreen() {
  return (
    <AppShell active="edital" title="Edital verticalizado">
      <div className="overflow-hidden rounded-[12px] border border-line-soft bg-surface">
        <div className="hidden grid-cols-[1fr_70px_110px_120px] gap-4 border-b border-line-soft px-4 py-2.5 text-xs text-fg-subtle sm:grid">
          <span>Disciplina e tópicos</span>
          <span>Peso</span>
          <span>Prioridade</span>
          <span>Progresso</span>
        </div>
        {editalDemo.map((d, i) => (
          <div key={d.subject} className="border-b border-line-soft last:border-0">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[1fr_70px_110px_120px]">
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                {d.topics.length ? <ChevronDown className="size-4 text-fg-subtle" /> : <ChevronRight className="size-4 text-fg-subtle" />}
                {d.subject}
              </span>
              <span className="hidden text-sm text-fg-muted sm:block">{d.weight}</span>
              <span className="hidden text-xs sm:block">
                <span className={cn("rounded px-1.5 py-0.5", i < 2 ? "bg-performance/15 text-[#ff6680]" : "bg-white/5 text-fg-subtle")}>
                  {i < 2 ? "Alta" : "Média"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <ProgressBar value={d.progress} tone="info" label={`Progresso em ${d.subject}`} className="hidden w-16 sm:block" />
                <span className="numeral text-xs text-fg-muted">{d.progress}%</span>
              </span>
            </div>
            {d.topics.map((t) => (
              <div key={t.name} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2 pl-10 sm:grid-cols-[1fr_70px_110px_120px]">
                <span className="flex items-center gap-2.5 text-[0.8125rem] text-fg-muted">
                  <span className="grid size-4 place-items-center">{statusIcon[t.status]}</span>
                  {t.name}
                </span>
                <span className="hidden sm:block" />
                <span className="hidden text-xs text-fg-subtle sm:block">{t.priority}</span>
                <span className="text-xs text-fg-subtle">{t.status}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
