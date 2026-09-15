"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { ChoiceGroup } from "@/components/ui/controls";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createQuestionAction, deleteQuestionAction, updateQuestionAction, type QuestionInput } from "@/modules/questions/actions";

type Option = { id: string; name: string };

export interface QuestionFormValues {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
  statement: string;
  explanation: string;
  options: { text: string; isCorrect: boolean }[];
  trueFalseAnswer: "Certo" | "Errado" | "";
  subjectId: string;
  topicId: string;
  examBoardId: string;
  competitionId: string;
  year: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  source: "USER" | "OFFICIAL" | "LICENSED";
  sourceReference: string;
}

export const emptyQuestion: QuestionFormValues = {
  type: "MULTIPLE_CHOICE",
  statement: "",
  explanation: "",
  options: ["", "", "", "", ""].map((text, i) => ({ text, isCorrect: i === 0 })),
  trueFalseAnswer: "",
  subjectId: "",
  topicId: "",
  examBoardId: "",
  competitionId: "",
  year: "",
  difficulty: "MEDIUM",
  source: "USER",
  sourceReference: "",
};

const LABELS = ["A", "B", "C", "D", "E"];

export function QuestionForm({
  initial = emptyQuestion,
  questionId,
  subjects,
  boards,
  competitions,
  answered = false,
}: {
  initial?: QuestionFormValues;
  questionId?: string;
  subjects: (Option & { topics: Option[] })[];
  boards: Option[];
  competitions: Option[];
  answered?: boolean;
}) {
  const [v, setV] = React.useState<QuestionFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof QuestionFormValues>(k: K, value: QuestionFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const subject = subjects.find((s) => s.id === v.subjectId);

  const submit = () => {
    const payload: QuestionInput = {
      type: v.type,
      statement: v.statement,
      explanation: v.explanation || undefined,
      options: v.type === "MULTIPLE_CHOICE" ? v.options.filter((o) => o.text.trim()) : [],
      trueFalseAnswer: v.trueFalseAnswer || undefined,
      subjectId: v.subjectId,
      topicId: v.topicId || undefined,
      examBoardId: v.examBoardId || undefined,
      competitionId: v.competitionId || undefined,
      year: v.year ? Number(v.year) : null,
      difficulty: v.difficulty,
      source: v.source,
      sourceReference: v.sourceReference || undefined,
    };
    startTransition(async () => {
      const r = questionId ? await updateQuestionAction(questionId, payload) : await createQuestionAction(payload);
      if (r && !r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMessage(r.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <form
      className="flex max-w-3xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      {message && <Notice tone="danger">{message}</Notice>}

      <ChoiceGroup<QuestionFormValues["type"]>
        aria-label="Tipo de questão"
        columns={2}
        value={v.type}
        onValueChange={(t) => set("type", t)}
        options={[
          { value: "MULTIPLE_CHOICE", label: "Múltipla escolha", description: "De 2 a 5 alternativas" },
          { value: "TRUE_FALSE", label: "Certo ou errado", description: "Julgamento de item" },
        ]}
      />
      {answered && <p className="-mt-3 text-sm text-fg-subtle">Esta questão já foi respondida: o número de alternativas não pode mudar.</p>}

      <Field label="Enunciado" htmlFor="q-statement" error={errors.statement}>
        <Textarea rows={6} value={v.statement} onChange={(e) => set("statement", e.target.value)} maxLength={8000} />
      </Field>

      {v.type === "MULTIPLE_CHOICE" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-fg-muted">Alternativas — marque a correta</legend>
          {v.options.map((o, i) => (
            <div key={i} className="flex items-center gap-3">
              <button
                type="button"
                role="radio"
                aria-checked={o.isCorrect}
                aria-label={`Alternativa ${LABELS[i]} é a correta`}
                onClick={() => set("options", v.options.map((x, j) => ({ ...x, isCorrect: j === i })))}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  o.isCorrect ? "bg-positive text-canvas" : "bg-elevated text-fg-muted hover:text-fg",
                )}
              >
                {LABELS[i]}
              </button>
              <Input
                value={o.text}
                onChange={(e) => set("options", v.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                aria-label={`Texto da alternativa ${LABELS[i]}`}
                maxLength={1000}
                placeholder={i < 2 ? "Obrigatória" : "Opcional"}
              />
            </div>
          ))}
          {errors.options && <p className="text-sm text-danger">{errors.options[0]}</p>}
        </fieldset>
      ) : (
        <Field label="Gabarito" htmlFor="q-tf" error={errors.trueFalseAnswer}>
          <NativeSelect value={v.trueFalseAnswer} onChange={(e) => set("trueFalseAnswer", e.target.value as QuestionFormValues["trueFalseAnswer"])} className="max-w-48">
            <option value="">Selecione</option>
            <option value="Certo">Certo</option>
            <option value="Errado">Errado</option>
          </NativeSelect>
        </Field>
      )}

      <Field label="Resolução" htmlFor="q-explanation" optional hint="Explique por que a resposta está correta. É o que aparece após responder.">
        <Textarea rows={5} value={v.explanation} onChange={(e) => set("explanation", e.target.value)} maxLength={8000} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Disciplina" htmlFor="q-subject" error={errors.subjectId}>
          <NativeSelect
            value={v.subjectId}
            onChange={(e) => {
              set("subjectId", e.target.value);
              set("topicId", "");
            }}
          >
            <option value="">Selecione</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Assunto" htmlFor="q-topic" optional>
          <NativeSelect value={v.topicId} onChange={(e) => set("topicId", e.target.value)} disabled={!subject}>
            <option value="">Selecione</option>
            {subject?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Banca" htmlFor="q-board" optional>
          <NativeSelect value={v.examBoardId} onChange={(e) => set("examBoardId", e.target.value)}>
            <option value="">Não informada</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Concurso" htmlFor="q-competition" optional>
          <NativeSelect value={v.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
            <option value="">Não informado</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ano" htmlFor="q-year" optional error={errors.year}>
          <Input type="number" inputMode="numeric" value={v.year} onChange={(e) => set("year", e.target.value)} />
        </Field>
        <Field label="Dificuldade" htmlFor="q-difficulty">
          <NativeSelect value={v.difficulty} onChange={(e) => set("difficulty", e.target.value as QuestionFormValues["difficulty"])}>
            {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 border-t pt-6">
        <legend className="sr-only">Origem</legend>
        <Field label="Origem" htmlFor="q-source" hint="Não cadastre questões copiadas de plataformas comerciais.">
          <NativeSelect value={v.source} onChange={(e) => set("source", e.target.value as QuestionFormValues["source"])} className="max-w-sm">
            <option value="USER">Elaborada por mim</option>
            <option value="OFFICIAL">Prova oficial (domínio público)</option>
            <option value="LICENSED">Conteúdo licenciado</option>
          </NativeSelect>
        </Field>
        <Field
          label="Referência"
          htmlFor="q-reference"
          optional={v.source === "USER"}
          error={errors.sourceReference}
          hint={v.source === "USER" ? "Ex.: livro, aula ou material usado como base." : "Prova, ano, órgão ou licença de uso."}
        >
          <Input value={v.sourceReference} onChange={(e) => set("sourceReference", e.target.value)} maxLength={500} />
        </Field>
      </fieldset>

      <div className="flex gap-2 border-t pt-6">
        <Button type="submit" variant="primary" loading={pending}>
          <Plus />
          {questionId ? "Salvar questão" : "Cadastrar questão"}
        </Button>
      </div>
    </form>
  );
}

export function DeleteQuestionButton({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Trash2 />
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent title="Excluir questão?" description="As tentativas e os registros do Caderno de Erros ligados a ela também serão removidos.">
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Manter questão
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteQuestionAction(id);
                if (r && !r.ok) toast.error(r.error);
              })
            }
          >
            Excluir questão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
