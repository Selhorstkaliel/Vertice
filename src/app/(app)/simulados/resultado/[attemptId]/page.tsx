import type { Metadata } from "next";
import Link from "next/link";
import { RichText } from "@/components/questions/rich-text";
import { richToPlain } from "@/engines/questions/rich-text";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Metric, Notice, PageHeader, Progress, SectionTitle } from "@/components/ui/display";
import { SimulationControls } from "@/components/simulations/simulation-controls";
import { SimulationErrorTools } from "@/components/simulations/error-tools";
import { CutoffForm } from "@/components/simulations/cutoff-form";
import { compareWithCutoff, slowQuestions, type Outcome, type ScoreResult } from "@/engines/simulations/scoring";
import { VERIFICATION_LABEL } from "@/lib/labels";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getAttemptResult } from "@/modules/simulations/service";
import { formatDateTime, formatMinutes, formatNumber, formatPercent, formatTimer, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Resultado do simulado" };

export default async function SimulationResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireOnboardedUser();
  const { attemptId } = await params;
  const result = await getAttemptResult(user.id, attemptId);
  if (!result) notFound();
  const { attempt, review, subjects, topics, biggestLoss, priorityTopic, previous, averageSec, averageSample, studentCutoff } = result;
  const rule = attempt.simulation.scoringRule;
  const ruled = attempt.ruleDetail && typeof attempt.ruleDetail === "object" && "maxPoints" in attempt.ruleDetail ? (attempt.ruleDetail as unknown as ScoreResult) : null;
  const share = ruled ? ruled.share : (attempt.score ?? 0);
  const catalogCutoff = rule && rule.cutoffScore !== null && rule.maxScore ? { score: rule.cutoffScore, max: rule.maxScore } : null;
  const cutoff = catalogCutoff ?? studentCutoff;
  const comparison = compareWithCutoff(share, cutoff);
  const outcomeOf = (r: (typeof review)[number]): Outcome => (r.isCorrect === true ? "CORRECT" : r.isCorrect === false ? "WRONG" : "BLANK");
  const slow = slowQuestions(review.map((r) => ({ ...r, outcome: outcomeOf(r) })), averageSec);
  const isDiagnostic = attempt.simulation.purpose === "DIAGNOSTIC";
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
          <p className="text-base text-fg-subtle">{ruled ? "Nota pela regra do concurso" : "Nota"}</p>
          <p className="flex items-baseline gap-2">
            <span className="numeral text-[3.5rem] leading-none font-light text-fg">{ruled ? formatNumber(ruled.points, 2) : attempt.correct}</span>
            <span className="text-lg text-fg-subtle">de {ruled ? formatNumber(ruled.maxPoints, 2) : total}</span>
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
      <p className="-mt-6 text-sm text-fg-subtle">
        {ruled
          ? `${ruled.mode === "PENALTY" ? `Cada erro anulou ${ruled.wrongPenalty} acerto(s); em branco vale zero.` : "Acertos com os pesos do edital, sem desconto por erro."} Regra ${rule?.year ?? ""}: ${rule ? VERIFICATION_LABEL[rule.verification].toLowerCase() : "removida depois do simulado"}. É uma estimativa, não a nota oficial.`
          : "Nota sem penalidade por erro: este concurso não tem regra de pontuação cadastrada."}{" "}
        Os erros foram registrados no Caderno de Erros.
      </p>

      {ruled?.eliminated && (
        <Notice tone="warning" title="Abaixo do mínimo exigido">
          {[
            ...ruled.bySubject.filter((s) => s.belowMinimum).map((s) => `${subjects.find((x) => x.id === s.subjectId)?.name ?? "Disciplina"}: ${formatPercent(s.share)} (mínimo ${formatPercent(s.minShare)})`),
            ruled.belowTotalMinimum ? `Total: ${formatPercent(ruled.share)}` : null,
          ]
            .filter(Boolean)
            .join("; ")}
          . Na prova real, isso eliminaria o candidato pela regra cadastrada.
        </Notice>
      )}

      {attempt.simulation.competitionId && (
        <section aria-labelledby="cutoff-title" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="cutoff-title">Comparação com a nota de corte</span>
          </SectionTitle>
          {comparison && cutoff ? (
            <p className="max-w-3xl text-base text-fg">
              Você fez {formatPercent(share)} da nota máxima. A nota de corte foi {formatNumber(cutoff.score, 2)} de {formatNumber(cutoff.max, 2)} ({formatPercent(comparison.cutoffShare)}):{" "}
              <span className={comparison.above ? "text-positive" : "text-danger"}>
                {comparison.above ? "acima" : "abaixo"} do corte por {Math.abs(Math.round(comparison.gap * 100))} pontos percentuais
              </span>
              . Na escala da prova, seria cerca de {formatNumber(comparison.equivalentPoints, 1)} pontos.
              <span className="mt-1 block text-sm text-fg-subtle">
                {catalogCutoff
                  ? `Nota de corte do catálogo (${rule?.year ?? "ano não informado"}), ${VERIFICATION_LABEL[rule!.verification].toLowerCase()}.`
                  : "Nota de corte informada por você."}{" "}
                A comparação é proporcional: o simulado tem {total} questões e pode ter outro nível de dificuldade.
              </span>
            </p>
          ) : (
            <p className="max-w-3xl text-base text-fg-muted">Não há nota de corte verificada no catálogo. Se você conhece a do último concurso, informe para comparar.</p>
          )}
          {!catalogCutoff && <CutoffForm competitionId={attempt.simulation.competitionId} initial={studentCutoff} />}
        </section>
      )}

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

      <section aria-labelledby="slow-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="slow-title">Onde você gastou mais tempo</span>
        </SectionTitle>
        {slow.averageSec === null ? (
          <p className="text-base text-fg-muted">O tempo por questão não foi registrado neste simulado.</p>
        ) : (
          <>
            <p className="max-w-3xl text-sm text-fg-subtle">
              {averageSec !== null
                ? `Comparado com a sua média de ${formatTimer(slow.averageSec)} por questão (${averageSample} questões fora deste simulado).`
                : `Comparado com a média deste simulado, ${formatTimer(slow.averageSec)} por questão: você ainda tem poucas questões com tempo registrado.`}
            </p>
            <div className="grid gap-8 md:grid-cols-2">
              {[
                { title: "Demorou e errou", items: slow.wrong, empty: "Nenhuma questão errada acima da média de tempo." },
                { title: "Demorou e acertou ou deixou em branco", items: slow.other, empty: "Nenhuma." },
              ].map((g) => (
                <div key={g.title} className="flex flex-col gap-2">
                  <h3 className="text-base font-medium text-fg">{g.title}</h3>
                  {g.items.length === 0 ? (
                    <p className="text-sm text-fg-subtle">{g.empty}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {g.items.slice(0, 8).map((r) => (
                        <li key={r.number} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5 text-base">
                          <a href={`#questao-${r.number}`} className="text-fg-muted hover:text-fg">
                            Questão {r.number}, {r.subjectName}
                          </a>
                          <span className="numeral text-sm text-fg-subtle">{formatTimer(r.timeSpentSec)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {isDiagnostic && (
        <Notice
          tone="info"
          title="Diagnóstico registrado"
          action={
            <Button asChild size="sm" variant="primary">
              <Link href="/rotina?inicio=1">Montar rotina e plano</Link>
            </Button>
          }
        >
          Os acertos e erros entraram no seu desempenho por tópico. Ao gerar o plano da semana, os tópicos em que você errou ganham prioridade. Se o plano já existia, ele só muda
          quando você pedir para recalcular.
        </Notice>
      )}

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
              <li key={r.number} id={`questao-${r.number}`} className="relative scroll-mt-24 border-b border-line-soft">
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
                    {r.isCorrect === false && <SimulationErrorTools entryId={r.errorEntryId} reason={r.errorReason} questionId={r.questionId} flashcardId={r.flashcardId} />}
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
