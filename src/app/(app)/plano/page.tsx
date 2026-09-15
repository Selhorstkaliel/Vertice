import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Metric, Notice, PageHeader, Progress } from "@/components/ui/display";
import { PlanItemRow } from "@/components/plan/plan-item-row";
import { GeneratePlanButton, RecommendationCard, RedistributePrompt, UndoRecommendation } from "@/components/plan/plan-controls";
import { ManualSessionDialog } from "@/components/plan/manual-session-dialog";
import { DiagnosticList, SustainabilityReadout } from "@/components/routine/analysis-panel";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getStudyPickerOptions, getWeekPlanView } from "@/modules/plan/queries";
import { analyzeUserRoutine } from "@/modules/routine/service";
import { markMissedItems } from "@/modules/plan/service";
import { db } from "@/lib/db";
import { capitalizeFirst, formatDayKey, formatMinutes, formatPercent, formatWeekRange, plural } from "@/lib/format";
import { addDays, isoWeekdayOfKey } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Plano" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const week = (await searchParams).semana === "proxima" ? "next" : "current";
  await markMissedItems(user.id, tz);

  const [view, subjects, routineBlocks, enrollments] = await Promise.all([
    getWeekPlanView(user.id, tz, week),
    getStudyPickerOptions(user.id),
    db.routineBlock.count({ where: { routine: { userId: user.id, isActive: true } } }),
    db.studentCompetition.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);
  const { analysis } = await analyzeUserRoutine(user.id, user.profile, view.weekStart, view.plan ? view.plannedMinutes : null);

  const remainingDays = Array.from({ length: 7 }, (_, i) => addDays(view.weekStart, i)).filter((d) => d >= view.today);
  const endOfWeek = isoWeekdayOfKey(view.today) >= 6;
  const rate = view.plannedToDateMinutes > 0 ? Math.min(1, view.executedMinutes / view.plannedToDateMinutes) : null;
  const weekLabel = capitalizeFirst(formatWeekRange(view.weekStart));
  const diagnostics = view.plan?.diagnostics.diagnostics?.filter((d) => !analysis.diagnostics.some((a) => a.code === d.code)) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={week === "next" ? "Plano da próxima semana" : "Plano da semana"}
        description={`${weekLabel}. Cada sessão tem um motivo; use “Por quê?” para ver os dados por trás da escolha.`}
        actions={
          <>
            <ManualSessionDialog subjects={subjects} today={view.today} />
            {enrollments > 0 && <GeneratePlanButton hasPlan={!!view.plan} week={week} />}
          </>
        }
      />

      <nav aria-label="Semana" className="-mt-4 flex gap-1.5">
        {([
          ["current", "/plano", "Esta semana"],
          ["next", "/plano?semana=proxima", "Próxima semana"],
        ] as const).map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            aria-current={week === key ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-base", week === key ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {week === "current" && endOfWeek && (
        <Notice tone="neutral" action={<Button asChild size="sm" variant="secondary"><Link href="/plano?semana=proxima">Planejar a próxima semana</Link></Button>}>
          A semana está terminando. Você já pode montar o plano da próxima.
        </Notice>
      )}

      {enrollments === 0 && (
        <Notice tone="warning" title="Nenhum concurso ativo" action={<Button asChild size="sm"><Link href="/concursos">Meus concursos</Link></Button>}>
          O plano é construído a partir do edital dos seus concursos.
        </Notice>
      )}

      {!view.plan ? (
        <EmptyState
          icon={<CalendarCheck2 />}
          title="Nenhum plano para esta semana"
          description={
            routineBlocks === 0
              ? "Cadastre sua rotina primeiro: o plano só usa horários livres e nunca ocupa compromissos fixos."
              : "Gere o plano para distribuir teoria, questões, revisões e flashcards nos seus horários livres, de acordo com as prioridades do edital."
          }
          action={
            routineBlocks === 0 ? (
              <Button asChild variant="primary">
                <Link href="/rotina">Configurar rotina</Link>
              </Button>
            ) : enrollments > 0 ? (
              <GeneratePlanButton hasPlan={false} week={week} />
            ) : null
          }
        />
      ) : (
        <>
          <section aria-labelledby="pvr-title" className="grid gap-8 border-y py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-5">
              <h2 id="pvr-title" className="sr-only">
                Planejado vs realizado
              </h2>
              <dl className="grid grid-cols-3 gap-6">
                <Metric label="Planejado na semana" value={formatMinutes(view.plannedMinutes)} size="lg" />
                <Metric label="Executado" value={formatMinutes(view.executedMinutes)} size="lg" />
                <Metric
                  label="Execução até agora"
                  value={formatPercent(rate)}
                  size="lg"
                  detail={rate === null ? "Nenhuma sessão prevista até agora" : `de ${formatMinutes(view.plannedToDateMinutes)} previstas até agora`}
                />
              </dl>
              {view.bySubject.length > 0 && (
                <table className="w-full text-left text-base">
                  <caption className="sr-only">Planejado e executado por disciplina</caption>
                  <thead>
                    <tr className="text-sm text-fg-subtle">
                      <th className="pb-2 font-normal">Disciplina</th>
                      <th className="pb-2 text-right font-normal">Planejado</th>
                      <th className="pb-2 text-right font-normal">Realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.bySubject.map((s) => (
                      <tr key={s.id} className="border-t border-line-soft">
                        <td className="py-2 text-fg">{s.name}</td>
                        <td className="numeral py-2 text-right text-fg-muted">{formatMinutes(s.planned)}</td>
                        <td className={cn("numeral py-2 text-right", s.plannedToDate > 0 && s.executed < s.plannedToDate * 0.6 ? "text-warning" : "text-fg")}>
                          {formatMinutes(s.executed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-col gap-5">
              <SustainabilityReadout analysis={analysis} omitPlanned />
            </div>
          </section>

          {week === "next" ? null : view.pendingRecommendation ? (
            <RecommendationCard rec={view.pendingRecommendation} />
          ) : view.missedCount > 0 ? (
            <Notice tone="warning" title={plural(view.missedCount, "sessão não realizada", "sessões não realizadas")} action={<RedistributePrompt missedCount={view.missedCount} />}>
              O Vértice pode propor novos horários nos dias com mais espaço, sem acumular tudo no dia seguinte.
            </Notice>
          ) : null}
          {view.undoableRecommendation && !view.pendingRecommendation && (
            <div className="-mt-6 flex items-center justify-between gap-3 text-sm text-fg-subtle">
              <span>
                {view.undoableRecommendation.status === "AUTO_APPLIED" ? "Reagendamento aplicado automaticamente." : "Reagendamento aplicado."}
              </span>
              <UndoRecommendation rec={view.undoableRecommendation} />
            </div>
          )}

          <section aria-label="Cronograma" className="flex flex-col gap-8">
            {view.days.map((day) => {
              const planned = day.items.filter((i) => !["CANCELED", "SKIPPED"].includes(i.status)).reduce((a, i) => a + i.endMinute - i.startMinute, 0);
              return (
                <div key={day.key} className={cn("flex flex-col", day.isPast && "opacity-80")}>
                  <div className="flex items-baseline justify-between gap-4 border-b pb-2">
                    <h3 className={cn("text-md font-semibold", day.isToday && "text-fg")}>
                      {capitalizeFirst(formatDayKey(day.key))}
                      {day.isToday && <span className="ml-2 text-sm font-normal text-performance">Hoje</span>}
                    </h3>
                    <span className="numeral text-sm text-fg-subtle">
                      {day.executedMinutes > 0 && `${formatMinutes(day.executedMinutes)} de `}
                      {formatMinutes(planned)}
                    </span>
                  </div>
                  {planned > 0 && day.executedMinutes > 0 && (
                    <Progress value={day.executedMinutes} max={planned} tone="positive" size="xs" className="mt-2" label={`Executado em ${formatDayKey(day.key)}`} />
                  )}
                  {day.items.length === 0 ? (
                    <p className="py-4 text-base text-fg-subtle">Sem sessões.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {day.items.map((item) => (
                        <PlanItemRow key={item.id} item={item} remainingDays={remainingDays} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          <section aria-labelledby="plan-diag" className="flex flex-col gap-2">
            <h2 id="plan-diag" className="text-md font-semibold">
              Análise do plano
            </h2>
            <DiagnosticList diagnostics={[...analysis.diagnostics, ...diagnostics]} empty="Nenhum problema detectado no plano." />
            <p className="text-sm text-fg-subtle">
              Versão {view.plan.version} do plano, motor {view.plan.engineVersion}. Mudanças na rotina ou no edital valem a partir do próximo recálculo.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
