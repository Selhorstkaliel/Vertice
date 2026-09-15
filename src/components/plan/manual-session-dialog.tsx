"use client";

import * as React from "react";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { PLAN_ITEM_KIND_LABEL } from "@/lib/labels";
import { parseClock } from "@/lib/format";
import { logManualSessionAction } from "@/modules/sessions/actions";
import { emptyOutcome, parseOutcome, SessionOutcomeFields, type Outcome } from "./session-outcome-fields";

export interface SubjectOption {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
}

type Kind = keyof typeof PLAN_ITEM_KIND_LABEL;

export function ManualSessionDialog({ subjects, today, trigger }: { subjects: SubjectOption[]; today: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("NEW_CONTENT");
  const [date, setDate] = React.useState(today);
  const [start, setStart] = React.useState("19:00");
  const [minutes, setMinutes] = React.useState("50");
  const [outcome, setOutcome] = React.useState<Outcome>(emptyOutcome);
  const [error, setError] = React.useState<{ message: string; fields?: Record<string, string[] | undefined> } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const subject = subjects.find((s) => s.id === subjectId);
  const topicRequired = kind === "NEW_CONTENT" || kind === "REVIEW";

  React.useEffect(() => {
    if (open) {
      setError(null);
      setOutcome(emptyOutcome);
      setDate(today);
    }
  }, [open, today]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <PenLine />
            Registrar sessão
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="Registrar sessão" description="Para estudos feitos fora do cronômetro.">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const startMinute = parseClock(start);
            if (startMinute === null) return setError({ message: "Horário inválido." });
            startTransition(async () => {
              const result = await logManualSessionAction({
                kind,
                subjectId: subjectId || undefined,
                topicId: topicId || undefined,
                dateKey: date,
                startMinute,
                minutes: Number(minutes),
                ...parseOutcome(outcome),
              });
              if (!result.ok) setError({ message: result.error, fields: result.fieldErrors });
              else {
                toast.success(result.message);
                setOpen(false);
              }
            });
          }}
        >
          {error && <Notice tone="danger">{error.message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Atividade" htmlFor="ms-kind">
              <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {(["NEW_CONTENT", "QUESTIONS", "REVIEW", "FLASHCARDS", "ERROR_NOTEBOOK", "WRITING"] as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {PLAN_ITEM_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Disciplina" htmlFor="ms-subject" optional={!topicRequired}>
              <NativeSelect
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTopicId("");
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
          </div>
          <Field label="Tópico" htmlFor="ms-topic" optional={!topicRequired} hint={subject ? undefined : "Escolha a disciplina primeiro."}>
            <NativeSelect value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subject}>
              <option value="">Selecione</option>
              {subject?.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Data" htmlFor="ms-date">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Início" htmlFor="ms-start">
              <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Minutos" htmlFor="ms-minutes" error={error?.fields?.minutes}>
              <Input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </div>
          <SessionOutcomeFields value={outcome} onChange={setOutcome} showContentCompleted={kind === "NEW_CONTENT" && !!topicId} errors={error?.fields} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={topicRequired && !topicId}>
              Registrar sessão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
