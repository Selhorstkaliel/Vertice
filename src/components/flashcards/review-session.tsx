"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Kbd, Notice, Progress } from "@/components/ui/display";
import { FLASHCARD_TYPE_LABEL, REVIEW_RATING_LABEL } from "@/lib/labels";
import { formatTimer } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RichText } from "@/components/questions/rich-text";
import { reviewFlashcardAction } from "@/modules/flashcards/actions";
import type { QueueCard } from "@/modules/flashcards/service";

type Rating = keyof typeof REVIEW_RATING_LABEL;
const RATINGS: { rating: Rating; key: string; tone: string }[] = [
  { rating: "AGAIN", key: "1", tone: "hover:shadow-[inset_0_0_0_1px_var(--danger)] [&_.label]:text-danger" },
  { rating: "HARD", key: "2", tone: "hover:shadow-[inset_0_0_0_1px_var(--warning)] [&_.label]:text-warning" },
  { rating: "GOOD", key: "3", tone: "hover:shadow-[inset_0_0_0_1px_var(--info)] [&_.label]:text-info" },
  { rating: "EASY", key: "4", tone: "hover:shadow-[inset_0_0_0_1px_var(--positive)] [&_.label]:text-positive" },
];

export function ReviewSession({ cards, onFinish }: { cards: QueueCard[]; /** Inside a sequence (daily mission): replaces the end screen. */ onFinish?: () => void }) {
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [counts, setCounts] = React.useState<Record<Rating, number>>({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
  const [last, setLast] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const shownAt = React.useRef(Date.now());
  const sessionStart = React.useRef(Date.now());
  const card = cards[index];
  const done = index >= cards.length;

  const rate = React.useCallback(
    (rating: Rating) => {
      if (!card || !revealed || pending) return;
      const durationMs = Date.now() - shownAt.current;
      startTransition(async () => {
        const r = await reviewFlashcardAction({ id: card.id, rating, durationMs });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
        setLast(r.data.explanation);
        setRevealed(false);
        setIndex((i) => i + 1);
        shownAt.current = Date.now();
      });
    },
    [card, revealed, pending],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || done) return;
      if ((e.key === " " || e.key === "Enter") && !revealed) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const match = RATINGS.find((r) => r.key === e.key);
      if (match && revealed) rate(match.rating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate, done]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <h2 className="text-xl font-semibold">Nenhum flashcard pendente</h2>
        <p className="text-base text-fg-muted">As próximas revisões aparecem aqui quando chegar a data calculada para cada cartão.</p>
        <Button asChild variant="secondary">
          <Link href="/flashcards">Voltar aos flashcards</Link>
        </Button>
      </div>
    );
  }

  if (done && onFinish) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return (
      <div className="flex flex-col items-start gap-4 py-6">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Flashcards concluídos</h2>
        <p className="text-base text-fg-muted">
          {total} {total === 1 ? "cartão revisado" : "cartões revisados"} em {formatTimer((Date.now() - sessionStart.current) / 1000)}.
        </p>
        <Button variant="primary" onClick={onFinish}>
          Continuar a missão
        </Button>
      </div>
    );
  }

  if (done) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return (
      <div className="flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Revisão concluída</h2>
          <p className="text-base text-fg-muted">
            {total} {total === 1 ? "cartão revisado" : "cartões revisados"} em {formatTimer((Date.now() - sessionStart.current) / 1000)}.
          </p>
        </div>
        <dl className="grid max-w-lg grid-cols-4 gap-4">
          {RATINGS.map((r) => (
            <div key={r.rating} className="flex flex-col gap-0.5">
              <dd className="numeral text-xl text-fg">{counts[r.rating]}</dd>
              <dt className="text-sm text-fg-subtle">{REVIEW_RATING_LABEL[r.rating]}</dt>
            </div>
          ))}
        </dl>
        {counts.AGAIN > 0 && <Notice tone="neutral">Os cartões marcados como “Errei” voltam em alguns minutos para reaprendizagem.</Notice>}
        <div className="flex gap-2">
          <Button asChild variant="primary">
            <Link href="/flashcards/revisar">Verificar novas pendências</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/flashcards">Voltar aos flashcards</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Progress value={index} max={cards.length} tone="neutral" size="xs" label="Progresso da revisão" className="flex-1" />
        <span className="numeral text-sm text-fg-subtle">
          {index + 1} de {cards.length}
        </span>
      </div>

      <article className="flex min-h-[22rem] flex-col rounded-[var(--radius-panel)] bg-surface" aria-live="polite">
        <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-6 py-3 text-sm text-fg-subtle">
          <span>{FLASHCARD_TYPE_LABEL[card!.type]}</span>
          {card!.subjectName && <span>{card!.subjectName}{card!.topicName ? ` › ${card!.topicName}` : ""}</span>}
          {card!.boardName && <span>{card!.boardName}</span>}
          {card!.state === "NEW" && <Badge tone="info">Novo</Badge>}
          {(card!.state === "LEARNING" || card!.state === "RELEARNING") && <Badge tone="warning">Em aprendizagem</Badge>}
        </header>
        <div className="flex flex-1 flex-col gap-6 px-6 py-8">
          <RichText text={card!.front} figures={card!.figures} className="text-lg leading-relaxed text-fg" />
          {revealed && (
            <div className="flex flex-col gap-4 border-t pt-6">
              <RichText text={card!.back} figures={card!.figures} className="text-md leading-relaxed text-fg-muted" />
              {card!.isBoardPattern && card!.patternEvidence && (
                <p className="text-sm text-fg-subtle">
                  <span className="font-medium text-fg-muted">Padrão observado, não regra: </span>
                  {card!.patternEvidence}
                </p>
              )}
            </div>
          )}
        </div>
      </article>

      {!revealed ? (
        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
            Mostrar resposta
          </Button>
          <span className="hidden text-sm text-fg-subtle sm:inline">
            <Kbd>Espaço</Kbd>
          </span>
        </div>
      ) : (
        <div role="group" aria-label="Como foi a lembrança?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={pending}
              onClick={() => rate(r.rating)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[var(--radius-object)] px-3 py-3 shadow-[inset_0_0_0_1px_var(--line)] transition-shadow disabled:opacity-50",
                r.tone,
              )}
            >
              <span className="label text-base font-medium text-fg">{REVIEW_RATING_LABEL[r.rating]}</span>
              <span className="text-sm text-fg-subtle">
                {card!.previews[r.rating]} <Kbd className="ml-1 hidden sm:inline-flex">{r.key}</Kbd>
              </span>
            </button>
          ))}
        </div>
      )}
      {last && <p className="text-sm text-fg-subtle">Cartão anterior: {last}</p>}
    </div>
  );
}
