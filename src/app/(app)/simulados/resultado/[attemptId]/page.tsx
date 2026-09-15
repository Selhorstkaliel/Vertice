import type { Metadata } from "next";
import Link from "next/link";
import { RichText } from "@/components/questions/rich-text";
import { richToPlain } from "@/engines/questions/rich-text";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Metric, Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/display";
import { SimulationControls } from "@/components/simulations/simulation-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getAttemptResult } from "@/modules/simulations/service";
import { formatDateTime, formatMinutes, formatPercent, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Resultado do simulado" };

export default async function SimulationResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireOnboardedUser();
  const { attemptId } = await params;
  const result = await getAttemptResult(user.id, attemptId);
  if (!result) notFound();
  const { attempt, review, subjects, topics, biggestLoss, priorityTopic, previous } = result;
  const tz = user.profile.timezone;
  const total = review.length;
  const prev = previous[0];
  const delta = prev?.score !== null && prev?.score !== undefined && attempt.score !== null ? attempt.score - prev.score : null;

  return (
    <div className="flex flex-col gap-10">
      <Link href="/simulados" className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg">
        <ChevronLeft className="size-4" />
        Simulados
      </Link>

      <PageHeader
        title={attempt.simulation.title}
        description={`Finalizado em ${attempt.finishedAt ? formatDateTime(attempt.finishedAt, tz) : "—"}${attempt.status === "EXPIRED" ? ", por tempo esgotado" : ""}.`}
        actions={<SimulationControls simulationId={attempt.simulationId} title={attempt.simulation.title} hasOpenAttempt={false} />}
      />

      <section aria-label="Resultado" className="flex flex-wrap items-end gap-x-14 gap-y-6 border-y py-6">
        <div className="flex flex-col gap-1">
          <p className="text-base text-fg-subtle">Nota</p>
          <p className="flex items-baseline gap-2">
            <span className="numeral text-[3.5rem] leading-none font-light text-fg">{attempt.correct}</span>
            <span className="text-lg text-fg-subtle">de {total}</span>
          </p>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-5">
          <Metric label="Percentual" value={formatPercent(attempt.score)} detail={delta !== null ? `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} p.p. em relação ao anterior` : undefined} />
          <Metric label="Tempo" value={formatMinutes((attempt.durationSec ?? 0) / 60)} />
          <Metric label="Certas" value={String(attempt.correct)} valueClassName="text-positive" />
          <Metric label="Erradas" value={String(attempt.wrong)} valueClassName="text-danger" />
          <Metric label="Não respondidas" value={String(attempt.unanswered)} />
        </dl>
      </section>
      <p className="-mt-6 text-sm text-fg-subtle">Nota sem penalidade por erro. Os erros foram registrados no Caderno de Erros.</p>

      {(biggestLoss || priorityTopic) && (
        <div className="grid gap-4 md:grid-cols-2">
          {biggestLoss && (
            <Notice tone="danger" title="Maior perda de pontos">
              {biggestLoss.name}: {plural(biggestLoss.lost, "questão perdida", "questões perdidas")} de {biggestLoss.total} ({formatPercent(biggestLoss.accuracy)} de acertos).
              {!biggestLoss.weighted && " Pesos do edital não confirmados: considerado o número de questões."}
            </Notice>
          )}
          {priorityTopic && (
            <Notice
              tone="warning"
              title="Conteúdo prioritário"
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/questoes?assunto=${priorityTopic.id}`}>Treinar assunto</Link>
                </Button>
              }
            >
              {priorityTopic.name} ({priorityTopic.subjectName}): {plural(priorityTopic.wrong, "erro", "erros")} em {plural(priorityTopic.total, "questão", "questões")}.
            </Notice>
          )}
        </div>
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="by-subject" className="flex flex-col gap-4">
          <SectionTitle>
            <span id="by-subject">Desempenho por matéria</span>
          </SectionTitle>
          <ul className="flex flex-col gap-4">
            {subjects.map((s) => (
              <li key={s.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base text-fg">{s.name}</span>
                  <span className="numeral text-base text-fg-muted">
                    {s.correct}/{s.total}, <span className="text-fg">{formatPercent(s.accuracy)}</span>
                  </span>
                </div>
                <Progress value={s.accuracy} tone={s.accuracy >= 0.7 ? "positive" : s.accuracy >= 0.55 ? "warning" : "danger"} size="xs" label={`Acertos em ${s.name}`} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="by-topic" className="flex flex-col gap-4">
          <SectionTitle>
            <span id="by-topic">Desempenho por tópico</span>
          </SectionTitle>
          <table className="w-full text-left">
            <caption className="sr-only">Acertos por tópico</caption>
            <thead>
              <tr className="text-sm text-fg-subtle">
                <th className="pb-2 font-normal">Tópico</th>
                <th className="pb-2 text-right font-normal">Questões</th>
                <th className="pb-2 text-right font-normal">Acertos</th>
              </tr>
            </thead>
            <tbody>
              {[...topics].sort((a, b) => a.accuracy - b.accuracy || b.total - a.total).map((t) => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="py-2">
                    <span className="block text-base text-fg">{t.name}</span>
                    <span className="block text-sm text-fg-subtle">{t.subjectName}</span>
                  </td>
                  <td className="numeral py-2 text-right text-base text-fg-muted">{t.total}</td>
                  <td className={cn("numeral py-2 text-right text-base", t.accuracy >= 0.7 ? "text-positive" : t.accuracy >= 0.55 ? "text-warning" : "text-danger")}>
                    {formatPercent(t.accuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-labelledby="comparison" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="comparison">Comparação com simulados anteriores</span>
        </SectionTitle>
        {previous.length === 0 ? (
          <p className="text-base text-fg-muted">Este é o primeiro simulado deste concurso. A comparação aparece a partir do próximo.</p>
        ) : (
          <table className="w-full max-w-2xl text-left">
            <caption className="sr-only">Simulados anteriores</caption>
            <tbody>
              <tr className="border-b border-line-soft">
                <td className="py-2 text-base font-medium text-fg">Este simulado</td>
                <td className="py-2 text-sm text-fg-subtle">{attempt.finishedAt ? formatDateTime(attempt.finishedAt, tz) : ""}</td>
                <td className="numeral py-2 text-right text-base font-medium text-fg">{formatPercent(attempt.score)}</td>
              </tr>
              {previous.map((p) => (
                <tr key={p.id} className="border-b border-line-soft">
                  <td className="py-2 text-base text-fg-muted">
                    <Link href={`/simulados/resultado/${p.id}`} className="hover:text-fg hover:underline hover:underline-offset-4">
                      {p.simulation.title}
                    </Link>
                  </td>
                  <td className="py-2 text-sm text-fg-subtle">{p.finishedAt ? formatDateTime(p.finishedAt, tz) : ""}</td>
                  <td className="numeral py-2 text-right text-base text-fg-muted">{formatPercent(p.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="review" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="review">Gabarito comentado</span>
        </SectionTitle>
        <ol className="flex flex-col border-t">
          {review.map((r) => {
            const selected = r.options.find((o) => o.id === r.selectedOptionId);
            const correct = r.options.find((o) => o.isCorrect);
            const status = r.isCorrect === true ? { label: "Certa", tone: "text-positive", rail: "bg-positive" } : r.isCorrect === false ? { label: "Errada", tone: "text-danger", rail: "bg-danger" } : { label: "Em branco", tone: "text-fg-subtle", rail: "bg-line" };
            return (
              <li key={r.number} className="relative border-b border-line-soft">
                <span aria-hidden="true" className={cn("absolute top-4 bottom-4 left-0 w-0.5 rounded-full", status.rail)} />
                <details className="group py-4 pl-4">
                  <summary className="flex cursor-pointer list-none flex-col gap-1 select-none">
                    <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
                      <span className="numeral font-medium text-fg">Questão {r.number}</span>
                      <span className={status.tone}>{status.label}</span>
                      <span className="text-fg-subtle">
                        {r.subjectName}
                        {r.topicName ? ` › ${r.topicName}` : ""}
                      </span>
                      {r.flagged && <span className="text-warning">Marcada com dúvida</span>}
                    </span>
                    <span className="line-clamp-2 text-base text-fg group-open:hidden">{richToPlain(r.statement)}</span>
                    <RichText text={r.statement} figures={r.figures} className="hidden text-base text-fg group-open:block" />
                  </summary>
                  <div className="mt-4 flex flex-col gap-4">
                    <ul className="flex flex-col gap-1.5">
                      {r.options.map((o) => (
                        <li
                          key={o.id}
                          className={cn(
                            "rounded-[var(--radius-control)] px-3 py-2 text-base",
                            o.isCorrect ? "bg-positive/10 text-fg" : o.id === r.selectedOptionId ? "bg-danger/10 text-fg" : "text-fg-muted",
                          )}
                        >
                          {r.type === "TRUE_FALSE" ? null : `${o.label}) `}
                          <RichText text={o.text} figures={r.figures} inline />
                          {o.isCorrect && <span className="ml-2 text-sm font-medium text-positive">Correta</span>}
                          {o.id === r.selectedOptionId && !o.isCorrect && <span className="ml-2 text-sm font-medium text-danger">Sua resposta</span>}
                        </li>
                      ))}
                    </ul>
                    {!selected && correct && <p className="text-sm text-fg-subtle">Você deixou em branco. Correta: {r.type === "TRUE_FALSE" ? correct.text : correct.label}.</p>}
                    {r.explanation && <RichText text={r.explanation} className="text-base leading-relaxed text-fg-muted" />}
                    {r.explanationNote && <p className="text-sm text-fg-subtle">{r.explanationNote}</p>}
                    <Link href={`/questoes/${r.questionId}`} className="self-start text-sm text-info hover:underline hover:underline-offset-4">
                      Abrir questão
                    </Link>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
