"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Notice } from "@/components/ui/display";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { DIFFICULTY_LABEL, FLASHCARD_TYPE_LABEL } from "@/lib/labels";
import { createFlashcardAction, updateFlashcardAction, type FlashcardInput } from "@/modules/flashcards/actions";

type Option = { id: string; name: string };
type CardType = keyof typeof FLASHCARD_TYPE_LABEL;

export interface FlashcardFormValues {
  front: string;
  back: string;
  type: CardType;
  subjectId: string;
  topicId: string;
  examBoardId: string;
  competitionId: string;
  difficulty: "" | "EASY" | "MEDIUM" | "HARD";
  tags: string;
  isBoardPattern: boolean;
  patternEvidence: string;
}

const empty: FlashcardFormValues = {
  front: "",
  back: "",
  type: "CONCEPT",
  subjectId: "",
  topicId: "",
  examBoardId: "",
  competitionId: "",
  difficulty: "",
  tags: "",
  isBoardPattern: false,
  patternEvidence: "",
};

export function FlashcardFormDialog({
  subjects,
  boards,
  competitions,
  initial,
  cardId,
  trigger,
}: {
  subjects: (Option & { topics: Option[] })[];
  boards: Option[];
  competitions: Option[];
  initial?: FlashcardFormValues;
  cardId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<FlashcardFormValues>(initial ?? empty);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof FlashcardFormValues>(k: K, value: FlashcardFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const subject = subjects.find((s) => s.id === v.subjectId);

  const submit = (keepOpen: boolean) => {
    const payload: FlashcardInput = {
      front: v.front,
      back: v.back,
      type: v.type,
      subjectId: v.subjectId || undefined,
      topicId: v.topicId || undefined,
      examBoardId: v.examBoardId || undefined,
      competitionId: v.competitionId || undefined,
      difficulty: v.difficulty || null,
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
      isBoardPattern: v.isBoardPattern,
      patternEvidence: v.patternEvidence || undefined,
    };
    startTransition(async () => {
      const r = cardId ? await updateFlashcardAction(cardId, payload) : await createFlashcardAction(payload);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMessage(r.fieldErrors ? null : r.error);
        return;
      }
      toast.success(r.message);
      setErrors({});
      setMessage(null);
      if (keepOpen) {
        // Keep classification to speed up creating cards in sequence.
        setV((p) => ({ ...p, front: "", back: "" }));
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial ?? empty);
          setErrors({});
          setMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Plus />
            Novo flashcard
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={cardId ? "Editar flashcard" : "Novo flashcard"} className="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          {message && <Notice tone="danger">{message}</Notice>}
          <Field label="Frente" htmlFor="fc-front" error={errors.front} hint="Uma pergunta objetiva, com uma única resposta.">
            <Textarea rows={3} value={v.front} onChange={(e) => set("front", e.target.value)} maxLength={2000} autoFocus />
          </Field>
          <Field label="Verso" htmlFor="fc-back" error={errors.back}>
            <Textarea rows={4} value={v.back} onChange={(e) => set("back", e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="fc-type">
              <NativeSelect value={v.type} onChange={(e) => set("type", e.target.value as CardType)}>
                {Object.entries(FLASHCARD_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Dificuldade" htmlFor="fc-difficulty" optional>
              <NativeSelect value={v.difficulty} onChange={(e) => set("difficulty", e.target.value as FlashcardFormValues["difficulty"])}>
                <option value="">Não informada</option>
                {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Disciplina" htmlFor="fc-subject" optional>
              <NativeSelect
                value={v.subjectId}
                onChange={(e) => {
                  set("subjectId", e.target.value);
                  set("topicId", "");
                }}
              >
                <option value="">Nenhuma</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tópico" htmlFor="fc-topic" optional>
              <NativeSelect value={v.topicId} onChange={(e) => set("topicId", e.target.value)} disabled={!subject}>
                <option value="">Nenhum</option>
                {subject?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Banca" htmlFor="fc-board" optional error={errors.examBoardId}>
              <NativeSelect value={v.examBoardId} onChange={(e) => set("examBoardId", e.target.value)}>
                <option value="">Nenhuma</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Concurso" htmlFor="fc-competition" optional>
              <NativeSelect value={v.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
                <option value="">Nenhum</option>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Tags" htmlFor="fc-tags" optional hint="Separe por vírgulas.">
            <Input value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="ex.: cinemática, fórmulas" />
          </Field>

          <div className="flex flex-col gap-3 rounded-[var(--radius-object)] bg-canvas-2 p-4">
            <div className="flex items-start gap-2.5">
              <Checkbox id="fc-pattern" checked={v.isBoardPattern} onCheckedChange={(c) => set("isBoardPattern", c === true)} className="mt-0.5" />
              <Label htmlFor="fc-pattern" className="flex flex-col gap-0.5 text-base text-fg">
                Padrão de cobrança da banca
                <span className="text-sm font-normal text-fg-subtle">Só marque com evidência concreta. O cartão exibirá a evidência, nunca o padrão como regra absoluta.</span>
              </Label>
            </div>
            {v.isBoardPattern && (
              <Field label="Evidência" htmlFor="fc-evidence" error={errors.patternEvidence} hint="Ex.: apareceu nas provas de 2019, 2021 e 2023 do cargo X.">
                <Textarea rows={2} value={v.patternEvidence} onChange={(e) => set("patternEvidence", e.target.value)} maxLength={1000} />
              </Field>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {!cardId && (
              <Button type="button" variant="secondary" loading={pending} onClick={() => submit(true)}>
                Salvar e criar outro
              </Button>
            )}
            <Button type="submit" variant="primary" loading={pending}>
              {cardId ? "Salvar flashcard" : "Criar flashcard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
