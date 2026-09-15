"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Check, Layers, NotebookPen, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/display";
import { ERROR_REASON_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { RichText, type QuestionFigure } from "./rich-text";
import { answerQuestionAction, toggleQuestionFlagAction, type AnswerResult } from "@/modules/questions/actions";
import { addAttemptToNotebookAction, updateErrorEntryAction } from "@/modules/errors/actions";
import { createFlashcardFromQuestionAction } from "@/modules/flashcards/actions";

type Reason = keyof typeof ERROR_REASON_LABEL;

export interface PlayerQuestion {
  id: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
  statement: string;
  figures: QuestionFigure[];
  options: { id: string; label: string; text: string }[];
  favorite: boolean;
  reviewLater: boolean;
  flashcardId: string | null;
}

function ReasonPicker({ value, onPick, disabled }: { value: Reason | null; onPick: (r: Reason) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Por que você errou?" className="flex flex-wrap gap-1.5">
      {(Object.keys(ERROR_REASON_LABEL) as Reason[]).map((r) => {
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(r)}
            className={cn(
              "h-8 rounded-full px-3 text-sm transition-colors disabled:opacity-50",
              on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
            )}
          >
            {ERROR_REASON_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

export function QuestionPlayer({ question, nextHref, afterAnswer }: { question: PlayerQuestion; nextHref: string | null; afterAnswer: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AnswerResult | null>(null);
  const [favorite, setFavorite] = React.useState(question.favorite);
  const [reviewLater, setReviewLater] = React.useState(question.reviewLater);
  const [flashcardId, setFlashcardId] = React.useState(question.flashcardId);
  const [reason, setReason] = React.useState<Reason | null>(null);
  const [entryId, setEntryId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const startedAt = React.useRef(Date.now());
  const resultRef = React.useRef<HTMLDivElement>(null);

  // Keyboard: A–E (or C/E for true/false) selects, Enter answers.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = e.key.toUpperCase();
      const option = question.options.find((o) => o.label === key);
      if (option) setSelected(option.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question.options, result]);

  const answer = () => {
    if (!selected) return;
    startTransition(async () => {
      const r = await answerQuestionAction({
        questionId: question.id,
        optionId: selected,
        timeSpentSec: Math.round((Date.now() - startedAt.current) / 1000),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r.data);
      setEntryId(r.data.errorEntryId);
      if (r.data.isCorrect) setReviewLater(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    });
  };

  const pickReason = (r: Reason) => {
    setReason(r);
    startTransition(async () => {
      if (entryId) {
        const res = await updateErrorEntryAction(entryId, { reason: r });
        if (!res.ok) toast.error(res.error);
      } else if (result) {
        const res = await addAttemptToNotebookAction(result.attemptId, r);
        if (!res.ok) toast.error(res.error);
        else {
          setEntryId(res.data.entryId);
          toast.success(res.message);
        }
      }
    });
  };

  const toggle = (flag: "favorite" | "reviewLater") => {
    const value = flag === "favorite" ? !favorite : !reviewLater;
    if (flag === "favorite") setFavorite(value);
    else setReviewLater(value);
    startTransition(async () => {
      const r = await toggleQuestionFlagAction(question.id, flag, value);
      if (!r.ok) {
        toast.error(r.error);
        if (flag === "favorite") setFavorite(!value);
        else setReviewLater(!value);
      } else toast.success(r.message);
    });
  };

  const optionState = (id: string) => {
    if (!result) return selected === id ? "selected" : "idle";
    if (id === result.correctOptionId) return "correct";
    if (id === result.selectedOptionId) return "wrong";
    return "dim";
  };

  return (
    <div className="flex flex-col gap-8">
      <RichText text={question.statement} figures={question.figures} className="max-w-3xl text-md leading-relaxed text-fg" />

      <div role="radiogroup" aria-label="Alternativas" className={cn("flex max-w-3xl gap-2", question.type === "TRUE_FALSE" ? "flex-row" : "flex-col")}>
        {question.options.map((o) => {
          const state = optionState(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected === o.id}
              disabled={!!result || pending}
              onClick={() => setSelected(o.id)}
              className={cn(
                "relative flex items-start gap-3 rounded-[var(--radius-object)] px-4 py-3 text-left transition-[background-color,box-shadow]",
                question.type === "TRUE_FALSE" && "flex-1 justify-center",
                state === "idle" && "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
                state === "selected" && "bg-surface shadow-[inset_0_0_0_1px_var(--fg-muted)]",
                state === "correct" && "bg-positive/10 shadow-[inset_0_0_0_1px_var(--positive)]",
                state === "wrong" && "bg-danger/10 shadow-[inset_0_0_0_1px_var(--danger)]",
                state === "dim" && "opacity-55 shadow-[inset_0_0_0_1px_var(--line-soft)]",
              )}
            >
              {question.type !== "TRUE_FALSE" && (
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    state === "selected" ? "bg-fg text-canvas" : state === "correct" ? "bg-positive text-canvas" : state === "wrong" ? "bg-danger text-canvas" : "bg-elevated text-fg-muted",
                  )}
                >
                  {o.label}
                </span>
              )}
              <span className="flex flex-col gap-0.5 pt-0.5">
                <RichText text={o.text} figures={question.figures} inline className={cn("text-base", question.type === "TRUE_FALSE" ? "font-medium" : "text-fg")} />
                {state === "correct" && <span className="text-sm font-medium text-positive">Resposta correta</span>}
                {state === "wrong" && <span className="text-sm font-medium text-danger">Sua resposta</span>}
              </span>
            </button>
          );
        })}
      </div>

      {!result ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={!selected} loading={pending} onClick={answer}>
            Responder
          </Button>
          <span className="text-sm text-fg-subtle">Atalhos: teclas das alternativas para escolher.</span>
        </div>
      ) : (
        <div ref={resultRef} tabIndex={-1} className="flex max-w-3xl flex-col gap-6 outline-none" aria-live="polite">
          <div className="flex items-center gap-3">
            {result.isCorrect ? (
              <span className="flex items-center gap-2 text-xl font-semibold text-positive">
                <Check className="size-6" aria-hidden="true" />
                Correta
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xl font-semibold text-danger">
                <X className="size-6" aria-hidden="true" />
                Incorreta
              </span>
            )}
            <span className="text-base text-fg-muted">Gabarito: {question.type === "TRUE_FALSE" ? question.options.find((o) => o.id === result.correctOptionId)?.text : result.correctLabel}</span>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-md font-semibold">Resolução</h2>
            {result.explanation ? (
              <>
                <RichText text={result.explanation} className="text-base leading-relaxed text-fg-muted" />
                {result.explanationNote && <p className="text-sm text-fg-subtle">{result.explanationNote}</p>}
              </>
            ) : (
              <p className="text-base text-fg-subtle">Esta questão não tem resolução cadastrada.</p>
            )}
          </section>

          {afterAnswer}

          {!result.isCorrect ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-md font-semibold">Por que você errou?</h2>
                <span className="text-sm text-fg-subtle">Registrado no Caderno de Erros</span>
              </div>
              <ReasonPicker value={reason} onPick={pickReason} disabled={pending} />
            </section>
          ) : entryId ? (
            <Notice tone="neutral">Adicionada ao Caderno de Erros como “{reason ? ERROR_REASON_LABEL[reason] : "sem motivo"}”.</Notice>
          ) : (
            <details className="group">
              <summary className="inline-flex cursor-pointer items-center gap-2 text-base text-fg-muted select-none hover:text-fg">
                <NotebookPen className="size-4" />
                Adicionar ao Caderno de Erros
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm text-fg-subtle">Acertou com dúvida? Registre o motivo para revisar depois.</p>
                <ReasonPicker value={reason} onPick={pickReason} disabled={pending} />
              </div>
            </details>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-5">
            {flashcardId ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/flashcards/${flashcardId}`}>
                  <Layers />
                  Ver flashcard
                </Link>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await createFlashcardFromQuestionAction(question.id);
                    if (!r.ok) toast.error(r.error);
                    else {
                      setFlashcardId(r.data.id);
                      toast.success(r.message);
                    }
                  })
                }
              >
                <Layers />
                Criar flashcard
              </Button>
            )}
            <Button variant={reviewLater ? "secondary" : "outline"} size="sm" aria-pressed={reviewLater} disabled={pending} onClick={() => toggle("reviewLater")}>
              <Bookmark className={cn(reviewLater && "fill-current")} />
              {reviewLater ? "Marcada para depois" : "Resolver novamente depois"}
            </Button>
            <Button variant={favorite ? "secondary" : "outline"} size="sm" aria-pressed={favorite} disabled={pending} onClick={() => toggle("favorite")}>
              <Star className={cn(favorite && "fill-current")} />
              {favorite ? "Favorita" : "Favoritar"}
            </Button>
            <span className="flex-1" />
            {nextHref && (
              <Button variant="primary" size="sm" onClick={() => router.push(nextHref)}>
                Próxima questão
              </Button>
            )}
          </div>
        </div>
      )}

      {!result && (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" aria-pressed={favorite} disabled={pending} onClick={() => toggle("favorite")}>
            <Star className={cn(favorite && "fill-current")} />
            {favorite ? "Favorita" : "Favoritar"}
          </Button>
          {nextHref && (
            <Button asChild variant="ghost" size="sm">
              <Link href={nextHref}>Pular questão</Link>
            </Button>
          )}
          {reviewLater && <Badge tone="info">Marcada para resolver depois</Badge>}
        </div>
      )}
    </div>
  );
}
