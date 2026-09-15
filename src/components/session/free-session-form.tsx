"use client";

import * as React from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/input";
import { PLAN_ITEM_KIND_LABEL } from "@/lib/labels";
import { startSessionAction } from "@/modules/sessions/actions";
import type { SubjectOption } from "@/components/plan/manual-session-dialog";

type Kind = keyof typeof PLAN_ITEM_KIND_LABEL;

export function FreeSessionForm({ subjects }: { subjects: SubjectOption[] }) {
  const [subjectId, setSubjectId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("NEW_CONTENT");
  const [pending, startTransition] = React.useTransition();
  const subject = subjects.find((s) => s.id === subjectId);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await startSessionAction({ kind, subjectId: subjectId || undefined, topicId: topicId || undefined });
          if (r && !r.ok) toast.error(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Atividade" htmlFor="fs-kind">
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(["NEW_CONTENT", "QUESTIONS", "REVIEW", "FLASHCARDS", "ERROR_NOTEBOOK", "WRITING"] as Kind[]).map((k) => (
              <option key={k} value={k}>
                {PLAN_ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Disciplina" htmlFor="fs-subject" optional>
          <NativeSelect
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId("");
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
        <Field label="Tópico" htmlFor="fs-topic" optional>
          <NativeSelect value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subject}>
            <option value="">Nenhum</option>
            {subject?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Button type="submit" variant="primary" className="self-start" loading={pending}>
        <Play />
        Iniciar sessão
      </Button>
    </form>
  );
}
