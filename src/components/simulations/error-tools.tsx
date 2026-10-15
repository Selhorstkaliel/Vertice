"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonPicker } from "@/components/questions/question-player";
import { updateErrorEntryAction } from "@/modules/errors/actions";
import { createFlashcardFromQuestionAction } from "@/modules/flashcards/actions";
import type { ERROR_REASON_LABEL } from "@/lib/labels";

type Reason = keyof typeof ERROR_REASON_LABEL;

/** Under each wrong answer of a finished simulation: why it went wrong, and a flashcard from it. */
export function SimulationErrorTools({
  entryId,
  reason: initialReason,
  questionId,
  flashcardId: initialCard,
}: {
  entryId: string | null;
  reason: Reason | null;
  questionId: string;
  flashcardId: string | null;
}) {
  const [reason, setReason] = React.useState<Reason | null>(initialReason);
  const [flashcardId, setFlashcardId] = React.useState(initialCard);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
      {entryId && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg-muted">Por que você errou?</p>
          <ReasonPicker
            value={reason}
            disabled={pending}
            onPick={(r) => {
              const previous = reason;
              setReason(r);
              startTransition(async () => {
                const res = await updateErrorEntryAction(entryId, { reason: r });
                if (!res.ok) {
                  setReason(previous);
                  toast.error(res.error);
                }
              });
            }}
          />
        </div>
      )}
      {flashcardId ? (
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={`/flashcards/${flashcardId}`}>
            <Layers />
            Ver flashcard
          </Link>
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await createFlashcardFromQuestionAction(questionId);
              if (!r.ok) toast.error(r.error);
              else {
                setFlashcardId(r.data.id);
                toast.success(r.message);
              }
            })
          }
        >
          <Layers />
          Virar flashcard
        </Button>
      )}
    </div>
  );
}
