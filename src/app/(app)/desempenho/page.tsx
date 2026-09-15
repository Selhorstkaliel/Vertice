import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Metric, PageHeader, Progress, SectionTitle } from "@/components/ui/display";
import { ReadinessComponents, ReadinessSummary } from "@/components/dashboard/readiness";
import { AccuracyTrendChart, ReadinessHistoryChart, SimulationScoresChart, StudyTimeChart } from "@/components/performance/performance-charts-lazy";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getPrimaryEnrollment, competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { buildInsights, readinessHistory, simulationSeries, subjectAccuracy, weakestTopics, weeklySeries } from "@/modules/performance/analytics";
import { readinessFor } from "@/modules/performance/metrics";
import { buildWeeklyReport, getLastWeeklyReport, listWeeklyReports, type WeeklyReportData } from "@/modules/performance/weekly-report";
import { flashcardStats } from "@/modules/flashcards/service";
import { formatDateShort, formatDayKey, formatMinutes, formatNumber, formatPercent } from "@/lib/format";
import { addDays, localNow, startOfWeek } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Desempenho" };

const PERIODS = [
  { weeks: 4, label: "4 semanas" },
  { weeks: 12, label: "12 semanas" },
  { weeks: 26, label: "26 semanas" },
];

function ReportBlock({ report }: { report: WeeklyReportData }) {
  const weekLabel = `${formatDayKey(report.weekStart, "dayMonth")} a ${formatDayKey(addDays(report.weekStart, 6), "dayMonth")}`;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-base text-fg-muted">
        Semana de {weekLabel}
        {!report.final && " (parcial)"}
      </p>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Tempo" value={formatMinutes(report.minutes)} detail={report.plannedMinutes ? `de ${formatMinutes(report.plannedMinutes)} planejadas` : undefined} size="sm" />
        <Metric label="Questões" value={formatNumber(report.questions)} size="sm" />
        <Metric label="Acertos" value={formatPercent(report.accuracy)} detail={report.accuracy === null && report.questions > 0 ? "Mínimo de 10 questões" : undefined} size="sm" />
        <Metric label="Tópicos" value={formatNumber(report.topicsStudied)} size="sm" />
        <Metric label="Flashcards revisados" value={formatNumber(report.flashcardsReviewed)} size="sm" />
        <Metric label="Simulados" value={formatNumber(report.simulations)} size="sm" />
      </dl>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-fg-subtle">Melhor disciplina</p>
          <p className="text-md text-fg">
            {report.bestSubject ? `${report.bestSubject.name}, ${formatPercent(report.bestSubject.accuracy)}` : "Sem disciplina com 10 ou mais questões"}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-fg-subtle">Prioridade</p>
          <p className="text-md text-fg">
            {report.priority ? `${report.priority.subjectName}, ${report.priority.topicName}${report.priority.accuracy !== null ? ` (${formatPercent(report.priority.accuracy)})` : ""}` : "—"}
          </p>
        </div>
      </div>
      {report.suggestion && (
        <p className="border-l-2 border-info pl-4 text-md text-fg">
          <span className="text-fg-muted">Sugestão: </span>
          {report.suggestion}
        </p>
      )}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ semanas?: string }> }) {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const params = await searchParams;
  const weeks = PERIODS.find((p) => String(p.weeks) === params.semanas)?.weeks ?? 12;
  const today = localNow(tz).key;

  const [series, subjects, weak, sims, primary, cards, lastReport, reports] = await Promise.all([
    weeklySeries(user.id, tz, weeks),
    subjectAccuracy(user.id, tz, weeks),
    weakestTopics(user.id),
    simulationSeries(user.id),
    getPrimaryEnrollment(user.id),
    flashcardStats(user.id, tz),
    getLastWeeklyReport(user.id, tz),
    listWeeklyReports(user.id),
  ]);
  const [insights, readiness, history, currentWeek] = await Promise.all([
    buildInsights(user.id, tz, series),
    primary ? readinessFor(user.id, { id: primary.competitionId, name: primary.competition.name }, tz, today) : Promise.resolve(null),
    readinessHistory(user.id, primary?.competitionId ?? null),
    buildWeeklyReport(user.id, tz, startOfWeek(today)),
  ]);

  const periodMinutes = series.reduce((a, w) => a + w.executedMinutes, 0);
  const periodAnswered = series.reduce((a, w) => a + w.answered, 0);
  const periodCorrect = series.reduce((a, w) => a + w.correct, 0);
  const periodSims = sims.filter((s) => s.finishedAt! >= new Date(Date.now() - weeks * 7 * 86_400_000));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Desempenho" description="O que está funcionando, onde você perde pontos e como sua preparação evoluiu." />

      <nav aria-label="Período" className="-mt-8 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.weeks}
            href={`/desempenho?semanas=${p.weeks}`}
            aria-current={weeks === p.weeks ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-base", weeks === p.weeks ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg")}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Tempo estudado" value={formatMinutes(periodMinutes)} size="lg" />
        <Metric label="Questões" value={formatNumber(periodAnswered)} size="lg" />
        <Metric label="Acertos" value={formatPercent(periodAnswered >= 10 ? periodCorrect / periodAnswered : null)} size="lg" detail={periodAnswered < 10 ? "Mínimo de 10 questões" : undefined} />
        <Metric label="Simulados" value={formatNumber(periodSims.length)} size="lg" />
        <Metric label="Retenção de flashcards" value={formatPercent(cards.retention)} size="lg" detail={cards.retention === null ? "Mínimo de 10 revisões" : "Últimos 30 dias"} />
      </dl>

      <section aria-labelledby="insights-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="insights-title">O que os dados mostram</span>
        </SectionTitle>
        {insights.length === 0 ? (
          <p className="text-base text-fg-muted">Ainda não há dados suficientes. Conclua sessões, responda questões e revise flashcards para ver as primeiras observações.</p>
        ) : (
          <ul className="flex flex-col">
            {insights.map((i) => {
              const Icon = i.tone === "positive" ? ArrowUpRight : i.tone === "warning" ? ArrowDownRight : Minus;
              return (
                <li key={i.id} className="flex items-start gap-3 border-b border-line-soft py-3 last:border-b-0">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", i.tone === "positive" ? "text-positive" : i.tone === "warning" ? "text-warning" : "text-fg-subtle")} aria-label={i.tone === "positive" ? "Melhora" : i.tone === "warning" ? "Atenção" : "Observação"} />
                  <p className="flex-1 text-md text-fg">{i.text}</p>
                  {i.href && (
                    <Link href={i.href} className="shrink-0 text-sm text-info hover:underline hover:underline-offset-4">
                      Ver
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {primary && readiness && (
        <section aria-labelledby="readiness-title" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <SectionTitle>
                <span id="readiness-title">Índice de Preparação</span>
              </SectionTitle>
              <ReadinessSummary readiness={readiness.readiness} competitionName={competitionTitle(primary.competition, effectiveExamDate(primary).date)} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-md font-semibold">Histórico do índice</h3>
              <ReadinessHistoryChart data={history.map((h) => ({ label: h.label, readiness: h.readiness }))} />
              <p className="text-sm text-fg-subtle">Registro diário. Valores passados não são recalculados com dados atuais.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-md font-semibold">Como o índice é composto</h3>
            <p className="text-sm text-fg-subtle">Cada componente vale de 0 a 100. Componentes sem dados ficam de fora, e os pesos dos demais são redistribuídos.</p>
            <ReadinessComponents readiness={readiness.readiness} />
          </div>
        </section>
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        <AccuracyTrendChart data={series} />
        <StudyTimeChart data={series} />
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="subjects-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="subjects-title" className="text-md font-semibold">
              Acertos por disciplina
            </h2>
            <p className="text-sm text-fg-subtle">Questões respondidas no banco do Vértice no período, ordenadas por acertos.</p>
          </div>
          {subjects.length === 0 ? (
            <p className="py-6 text-base text-fg-muted">Nenhuma questão respondida no período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {[...subjects].sort((a, b) => b.accuracy - a.accuracy).map((s) => (
                <li key={s.subjectId} className="grid grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_7rem] items-center gap-3">
                  <span className="truncate text-base text-fg">{s.name}</span>
                  <span className="relative h-2 rounded-full bg-line-soft" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-chart-series" style={{ width: `${s.accuracy * 100}%` }} />
                    <span className="absolute -inset-y-1 w-px bg-fg-faint" style={{ left: "70%" }} />
                  </span>
                  <span className="text-right text-base">
                    <span className="numeral text-fg">{formatPercent(s.accuracy)}</span>
                    <span className="numeral ml-1.5 text-sm text-fg-subtle" title="Questões respondidas">
                      {s.answered}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {subjects.length > 0 && <p className="text-sm text-fg-subtle">A marca vertical indica a meta de 70%. O número menor é a quantidade de questões respondidas.</p>}
        </section>

        <section aria-labelledby="weak-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="weak-title" className="text-md font-semibold">
              Tópicos com menor desempenho
            </h2>
            <p className="text-sm text-fg-subtle">Tópicos com 5 ou mais questões, incluindo as registradas em sessões.</p>
          </div>
          {weak.length === 0 ? (
            <p className="py-6 text-base text-fg-muted">Nenhum tópico com questões suficientes.</p>
          ) : (
            <table className="w-full text-left">
              <caption className="sr-only">Tópicos com menor percentual de acertos</caption>
              <thead>
                <tr className="text-sm text-fg-subtle">
                  <th className="pb-2 font-normal">Tópico</th>
                  <th className="pb-2 text-right font-normal">Questões</th>
                  <th className="pb-2 text-right font-normal">Acertos</th>
                  <th className="pb-2 text-right font-normal">Revisão</th>
                </tr>
              </thead>
              <tbody>
                {weak.map((t) => (
                  <tr key={t.id} className="border-t border-line-soft">
                    <td className="py-2.5">
                      <Link href={`/edital?topico=${t.id}`} className="flex flex-col hover:[&>span:first-child]:underline">
                        <span className="text-base text-fg underline-offset-4">{t.name}</span>
                        <span className="text-sm text-fg-subtle">{t.subjectName}</span>
                      </Link>
                    </td>
                    <td className="numeral py-2.5 text-right text-base text-fg-muted">{t.answered}</td>
                    <td className={cn("numeral py-2.5 text-right text-base", t.accuracy >= 0.7 ? "text-positive" : t.accuracy >= 0.55 ? "text-warning" : "text-danger")}>{formatPercent(t.accuracy)}</td>
                    <td className="py-2.5 text-right text-sm text-fg-subtle">{t.nextReviewAt ? formatDateShort(t.nextReviewAt, tz) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <SimulationScoresChart
        data={sims.map((s) => ({
          id: s.id,
          label: formatDateShort(s.finishedAt!, tz),
          title: s.simulation.title,
          score: s.score!,
          correct: s.correct,
          total: s.correct + s.wrong + s.unanswered,
        }))}
      />

      {readiness && readiness.coverage.bySubject.length > 0 && (
        <section aria-labelledby="coverage-title" className="flex flex-col gap-3">
          <SectionTitle action={<Link href="/edital" className="text-sm text-info hover:underline hover:underline-offset-4">Abrir edital</Link>}>
            <span id="coverage-title">Progresso do edital</span>
          </SectionTitle>
          <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {readiness.coverage.bySubject.map((s) => (
              <li key={s.subjectId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base text-fg">{s.subjectName}</span>
                  <span className="numeral text-base text-fg-muted">
                    {s.studied}/{s.leafTopics} tópicos, <span className="text-fg">{formatPercent(s.coverage)}</span>
                  </span>
                </div>
                <Progress value={s.coverage} tone="neutral" size="xs" label={`Edital de ${s.subjectName}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="report-title" className="flex flex-col gap-6 border-t pt-10">
        <SectionTitle>
          <span id="report-title">Relatório semanal</span>
        </SectionTitle>
        {lastReport ? <ReportBlock report={lastReport} /> : <p className="text-base text-fg-muted">O relatório da semana anterior aparece aqui quando houver atividade registrada nela.</p>}
        {(currentWeek.minutes > 0 || currentWeek.questions > 0) && (
          <details className="group">
            <summary className="cursor-pointer text-base text-fg-muted select-none hover:text-fg">Semana atual até agora</summary>
            <div className="mt-5">
              <ReportBlock report={currentWeek} />
            </div>
          </details>
        )}
        {reports.length > 1 && (
          <details className="group">
            <summary className="cursor-pointer text-base text-fg-muted select-none hover:text-fg">Relatórios anteriores</summary>
            <ul className="mt-3 flex flex-col">
              {reports.slice(1).map((r) => (
                <li key={r.weekStart} className="grid grid-cols-[8rem_repeat(3,minmax(0,1fr))] gap-3 border-b border-line-soft py-2 text-base">
                  <span className="text-fg-muted">{formatDayKey(r.weekStart, "dayMonth")}</span>
                  <span className="numeral text-right text-fg">{formatMinutes(r.data.minutes)}</span>
                  <span className="numeral text-right text-fg">{formatNumber(r.data.questions)} questões</span>
                  <span className="numeral text-right text-fg">{formatPercent(r.data.accuracy)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
