"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, Notice } from "@/components/ui/display";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { formatTimer, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RichText, type QuestionFigure } from "@/components/questions/rich-text";
import { finishSimulationAction, saveSimulationAnswerAction } from "@/modules/simulations/actions";

export interface RunnerQuestion {
  simulationQuestionId: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
  statement: string;
  figures: QuestionFigure[];
  subjectName: string;
  options: { id: string; label: string; text: string }[];
}

interface AnswerState {
  optionId: string | null;
  flagged: boolean;
}

export function SimulationRunner({
  attemptId,
  title,
  questions,
  initialAnswers,
  deadlineAt,
}: {
  attemptId: string;
  title: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, AnswerState>;
  deadlineAt: string | null;
}) {
  const [index, setIndex] = React.useState(() => {
    const firstOpen = questions.findIndex((q) => !initialAnswers[q.simulationQuestionId]?.optionId);
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [answers, setAnswers] = React.useState<Record<string, AnswerState>>(initialAnswers);
  const [reviewing, setReviewing] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(0);
  const [saveError, setSaveError] = React.useState(false);
  const [finishing, startFinishing] = React.useTransition();
  const [now, setNow] = React.useState(() => Date.now());
  const finishedRef = React.useRef(false);
  const statementRef = React.useRef<HTMLDivElement>(null);

  const q = questions[index]!;
  const current = answers[q.simulationQuestionId] ?? { optionId: null, flagged: false };
  const answeredCount = questions.filter((x) => answers[x.simulationQuestionId]?.optionId).length;
  const flaggedList = questions.map((x, i) => ({ i, a: answers[x.simulationQuestionId] })).filter((x) => x.a?.flagged);
  const unansweredList = questions.map((x, i) => ({ i, a: answers[x.simulationQuestionId] })).filter((x) => !x.a?.optionId);
  const remaining = deadlineAt ? Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000)) : null;

  const finish = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    startFinishing(async () => {
      const r = await finishSimulationAction(attemptId);
      if (r && !r.ok) {
        finishedRef.current = false;
        toast.error(r.error);
      }
    });
  }, [attemptId]);

  React.useEffect(() => {
    if (!deadlineAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  React.useEffect(() => {
    if (remaining === 0) {
      toast.message("Tempo esgotado. Finalizando o simulado.");
      finish();
    }
  }, [remaining, finish]);

  const save = React.useCallback(
    (simulationQuestionId: string, patch: Partial<AnswerState>) => {
      setAnswers((prev) => ({ ...prev, [simulationQuestionId]: { optionId: null, flagged: false, ...prev[simulationQuestionId], ...patch } }));
      setSaving((n) => n + 1);
      saveSimulationAnswerAction({ attemptId, simulationQuestionId, ...(patch.optionId !== undefined ? { optionId: patch.optionId } : {}), ...(patch.flagged !== undefined ? { flagged: patch.flagged } : {}) })
        .then((r) => {
          if (!r.ok) {
            setSaveError(true);
            toast.error(r.error);
          } else {
            setSaveError(false);
            if (r.data.expired) finish();
          }
        })
        .catch(() => setSaveError(true))
        .finally(() => setSaving((n) => n - 1));
    },
    [attemptId, finish],
  );

  const go = React.useCallback(
    (i: number) => {
      setReviewing(false);
      setIndex(Math.max(0, Math.min(questions.length - 1, i)));
      requestAnimationFrame(() => statementRef.current?.focus());
    },
    [questions.length],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reviewing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key.toLowerCase() === "m") save(q.simulationQuestionId, { flagged: !current.flagged });
      else {
        const opt = q.options.find((o) => o.label === e.key.toUpperCase());
        if (opt) save(q.simulationQuestionId, { optionId: opt.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewing, index, q, current.flagged, go, save]);

  const lowTime = remaining !== null && remaining <= 300;

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-medium text-fg">{title}</span>
          <span className="text-sm text-fg-subtle">
            {answeredCount} de {questions.length} respondidas
            {saving > 0 ? " — salvando…" : saveError ? " — falha ao salvar, tente de novo" : " — respostas salvas"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className={cn("flex items-baseline gap-2", lowTime ? "text-warning" : "text-fg")} aria-live="off">
              <span className="text-sm text-fg-subtle">{lowTime ? "Últimos minutos" : "Restante"}</span>
              <span className="font-mono text-lg tabular-nums">{formatTimer(remaining)}</span>
            </span>
          )}
          {!reviewing && (
            <Button variant="secondary" size="sm" onClick={() => setReviewing(true)}>
              Revisar e finalizar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {reviewing ? (
          <section aria-labelledby="review-title" className="flex flex-col gap-6">
            <h2 id="review-title" className="text-xl font-semibold tracking-[-0.02em]">
              Revisão antes de finalizar
            </h2>
            <dl className="grid max-w-md grid-cols-3 gap-4">
              <div className="flex flex-col gap-0.5">
                <dd className="numeral text-2xl text-fg">{answeredCount}</dd>
                <dt className="text-sm text-fg-subtle">Respondidas</dt>
              </div>
              <div className="flex flex-col gap-0.5">
                <dd className="numeral text-2xl text-fg">{unansweredList.length}</dd>
                <dt className="text-sm text-fg-subtle">Em branco</dt>
              </div>
              <div className="flex flex-col gap-0.5">
                <dd className="numeral text-2xl text-fg">{flaggedList.length}</dd>
                <dt className="text-sm text-fg-subtle">Com dúvida</dt>
              </div>
            </dl>
            {unansweredList.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-base text-fg-muted">Em branco</p>
                <div className="flex flex-wrap gap-1.5">
                  {unansweredList.map(({ i }) => (
                    <Button key={i} size="sm" variant="outline" className="numeral w-10" onClick={() => go(i)} aria-label={`Ir para a questão ${i + 1}`}>
                      {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {flaggedList.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-base text-fg-muted">Marcadas com dúvida</p>
                <div className="flex flex-wrap gap-1.5">
                  {flaggedList.map(({ i }) => (
                    <Button key={i} size="sm" variant="outline" className="numeral w-10" onClick={() => go(i)} aria-label={`Ir para a questão ${i + 1}`}>
                      {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-6">
              <Button variant="primary" size="lg" loading={finishing} onClick={() => (unansweredList.length ? setConfirmOpen(true) : finish())}>
                Finalizar simulado
              </Button>
              <Button variant="ghost" size="lg" onClick={() => go(index)}>
                Voltar ao simulado
              </Button>
            </div>
          </section>
        ) : (
          <section aria-label={`Questão ${index + 1} de ${questions.length}`} className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base text-fg-subtle">
                <span className="numeral font-medium text-fg">Questão {index + 1}</span> de {questions.length}, {q.subjectName}
              </p>
              <Button
                size="sm"
                variant={current.flagged ? "secondary" : "ghost"}
                aria-pressed={current.flagged}
                onClick={() => save(q.simulationQuestionId, { flagged: !current.flagged })}
              >
                <Flag className={cn(current.flagged && "fill-current text-warning")} />
                {current.flagged ? "Com dúvida" : "Marcar dúvida"}
              </Button>
            </div>

            <div ref={statementRef} tabIndex={-1} className="max-w-3xl text-md leading-relaxed text-fg outline-none">
              <RichText text={q.statement} figures={q.figures} />
            </div>

            <div role="radiogroup" aria-label="Alternativas" className={cn("flex max-w-3xl gap-2", q.type === "TRUE_FALSE" ? "flex-row" : "flex-col")}>
              {q.options.map((o) => {
                const on = current.optionId === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => save(q.simulationQuestionId, { optionId: on ? null : o.id })}
                    className={cn(
                      "flex items-start gap-3 rounded-[var(--radius-object)] px-4 py-3 text-left transition-[background-color,box-shadow]",
                      q.type === "TRUE_FALSE" && "flex-1 justify-center",
                      on ? "bg-surface shadow-[inset_0_0_0_1px_var(--fg-muted)]" : "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
                    )}
                  >
                    {q.type !== "TRUE_FALSE" && (
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", on ? "bg-fg text-canvas" : "bg-elevated text-fg-muted")}>
                        {o.label}
                      </span>
                    )}
                    <RichText text={o.text} figures={q.figures} inline className={cn("pt-0.5 text-base", on ? "text-fg" : "text-fg-muted")} />
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-fg-subtle">
              Clique de novo na alternativa marcada para deixar em branco. Atalhos: letras escolhem, <Kbd>M</Kbd> marca dúvida, <Kbd>←</Kbd> <Kbd>→</Kbd> navegam.
            </p>

            <div className="flex items-center justify-between gap-2 border-t pt-5">
              <Button variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}>
                <ChevronLeft />
                Anterior
              </Button>
              {index < questions.length - 1 ? (
                <Button variant="secondary" onClick={() => go(index + 1)}>
                  Próxima
                  <ChevronRight />
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setReviewing(true)}>
                  Revisar e finalizar
                </Button>
              )}
            </div>
          </section>
        )}

        <aside className="flex flex-col gap-3">
          <p className="text-sm font-medium text-fg-muted">Navegação</p>
          <nav aria-label="Questões do simulado" className="grid grid-cols-8 gap-1.5 lg:grid-cols-5">
            {questions.map((x, i) => {
              const a = answers[x.simulationQuestionId];
              const answered = !!a?.optionId;
              return (
                <button
                  key={x.simulationQuestionId}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={!reviewing && i === index ? "true" : undefined}
                  aria-label={`Questão ${i + 1}${answered ? ", respondida" : ", em branco"}${a?.flagged ? ", com dúvida" : ""}`}
                  className={cn(
                    "numeral relative flex h-9 items-center justify-center rounded-[var(--radius-control)] text-sm transition-colors",
                    answered ? "bg-elevated text-fg" : "text-fg-subtle shadow-[inset_0_0_0_1px_var(--line)]",
                    !reviewing && i === index && "shadow-[inset_0_0_0_2px_var(--fg)]",
                  )}
                >
                  {i + 1}
                  {a?.flagged && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-warning" />}
                </button>
              );
            })}
          </nav>
          <ul className="flex flex-col gap-1 text-xs text-fg-subtle">
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-[3px] bg-elevated" aria-hidden="true" /> Respondida
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-[3px] shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden="true" /> Em branco
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" /> Com dúvida
            </li>
          </ul>
          {remaining === null && <Notice tone="neutral">Simulado sem tempo limite.</Notice>}
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Finalizar com questões em branco?"
          description={`${plural(unansweredList.length, "questão ficará", "questões ficarão")} sem resposta e ${unansweredList.length === 1 ? "contará" : "contarão"} como não respondidas.`}
        >
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Continuar respondendo
            </Button>
            <Button variant="primary" loading={finishing} onClick={finish}>
              Finalizar simulado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
