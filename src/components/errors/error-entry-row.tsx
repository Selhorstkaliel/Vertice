"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, Layers, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { ERROR_REASON_LABEL } from "@/lib/labels";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RichText, type QuestionFigure } from "@/components/questions/rich-text";
import { richToPlain } from "@/engines/questions/rich-text";
import { deleteErrorEntryAction, setErrorResolvedAction, updateErrorEntryAction } from "@/modules/errors/actions";
import { createFlashcardFromErrorAction } from "@/modules/flashcards/actions";

type Reason = keyof typeof ERROR_REASON_LABEL;

export interface ErrorRow {
  id: string;
  createdAt: string;
  resolved: boolean;
  reason: Reason | null;
  note: string | null;
  subjectName: string;
  topicName: string | null;
  topicId: string | null;
  boardName: string | null;
  questionId: string | null;
  statement: string | null;
  figures: QuestionFigure[];
  explanation: string | null;
  selected: { label: string; text: string } | null;
  correct: { label: string; text: string } | null;
  flashcardId: string | null;
}

export function ErrorEntryRow({ entry, tz }: { entry: ErrorRow; tz: string }) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState(entry.note ?? "");
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });

  return (
    <li className={cn("relative border-b border-line-soft", entry.resolved && "opacity-70")}>
      <span aria-hidden="true" className={cn("absolute top-4 bottom-4 left-0 w-0.5 rounded-full", entry.resolved ? "bg-positive" : "bg-danger")} />
      <div className="flex flex-col gap-3 py-4 pl-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-start gap-3 text-left">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {entry.statement === null ? (
              <p className="text-base text-fg">Questão removida do banco.</p>
            ) : open ? (
              <RichText text={entry.statement} figures={entry.figures} className="text-base text-fg" />
            ) : (
              <p className="line-clamp-2 text-base text-fg">{richToPlain(entry.statement)}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-fg-subtle">
              <span className={entry.resolved ? "text-positive" : "text-danger"}>{entry.resolved ? "Revisado" : "Em aberto"}</span>
              <span>
                {entry.subjectName}
                {entry.topicName ? ` › ${entry.topicName}` : ""}
              </span>
              {entry.boardName && <span>{entry.boardName}</span>}
              <span>{formatDateShort(new Date(entry.createdAt), tz)}</span>
              <span>{entry.reason ? ERROR_REASON_LABEL[entry.reason] : "Motivo não informado"}</span>
            </div>
          </div>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="flex flex-col gap-5 pr-1">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-[var(--radius-object)] bg-danger/8 p-3">
                <dt className="text-sm font-medium text-danger">Sua resposta</dt>
                <dd className="text-base text-fg">{entry.selected ? <>{entry.selected.label}) <RichText text={entry.selected.text} figures={entry.figures} inline /></> : "—"}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-[var(--radius-object)] bg-positive/8 p-3">
                <dt className="text-sm font-medium text-positive">Resposta correta</dt>
                <dd className="text-base text-fg">{entry.correct ? <>{entry.correct.label}) <RichText text={entry.correct.text} figures={entry.figures} inline /></> : "—"}</dd>
              </div>
            </dl>
            {entry.explanation && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-fg-muted">Resolução</p>
                <RichText text={entry.explanation} className="text-base leading-relaxed text-fg-muted" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-muted">
                Por que você errou?
                <NativeSelect
                  defaultValue={entry.reason ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => updateErrorEntryAction(entry.id, { reason: (e.target.value || null) as Reason | null }))}
                >
                  <option value="">Não informado</option>
                  {Object.entries(ERROR_REASON_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-muted">
                Observação
                <Textarea
                  rows={2}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => {
                    if (note !== (entry.note ?? "")) run(() => updateErrorEntryAction(entry.id, { reason: entry.reason, note }));
                  }}
                  placeholder="O que fazer diferente na próxima vez"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.questionId && (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/questoes/${entry.questionId}`}>
                    <RotateCcw />
                    Resolver novamente
                  </Link>
                </Button>
              )}
              {entry.flashcardId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/flashcards/${entry.flashcardId}`}>
                    <Layers />
                    Ver flashcard
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => createFlashcardFromErrorAction(entry.id))}>
                  <Layers />
                  Criar flashcard
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setErrorResolvedAction(entry.id, !entry.resolved))}>
                {entry.resolved ? "Reabrir" : "Marcar como revisado"}
              </Button>
              {entry.topicId && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/questoes?assunto=${entry.topicId}`}>Mais questões do assunto</Link>
                </Button>
              )}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteErrorEntryAction(entry.id))} aria-label="Excluir registro">
                <Trash2 />
              </Button>
            </div>
            {entry.resolved && <Badge tone="positive" className="self-start">Não entra mais na prioridade de revisão</Badge>}
          </div>
        )}
      </div>
    </li>
  );
}
