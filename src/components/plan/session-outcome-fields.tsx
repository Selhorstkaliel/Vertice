"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/controls";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Outcome {
  focus: number | null;
  questionsCount: string;
  questionsCorrect: string;
  contentCompleted: boolean;
  notes: string;
}

export const emptyOutcome: Outcome = { focus: null, questionsCount: "", questionsCorrect: "", contentCompleted: false, notes: "" };

export function parseOutcome(o: Outcome) {
  const count = o.questionsCount.trim() === "" ? null : Number(o.questionsCount);
  const correct = o.questionsCorrect.trim() === "" ? null : Number(o.questionsCorrect);
  return {
    focus: o.focus,
    questionsCount: count !== null && Number.isFinite(count) ? Math.round(count) : null,
    questionsCorrect: correct !== null && Number.isFinite(correct) ? Math.round(correct) : null,
    contentCompleted: o.contentCompleted,
    notes: o.notes.trim() || undefined,
  };
}

const FOCUS = ["Muito baixa", "Baixa", "Média", "Alta", "Muito alta"];

export function SessionOutcomeFields({
  value,
  onChange,
  showContentCompleted,
  showQuestions = true,
  errors,
}: {
  value: Outcome;
  onChange: (next: Outcome) => void;
  showContentCompleted: boolean;
  showQuestions?: boolean;
  errors?: Record<string, string[] | undefined>;
}) {
  const set = <K extends keyof Outcome>(key: K, v: Outcome[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">
          Concentração percebida <span className="font-normal text-fg-subtle">— opcional</span>
        </legend>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Concentração percebida">
          {FOCUS.map((label, i) => {
            const n = i + 1;
            const on = value.focus === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("focus", on ? null : n)}
                className={cn(
                  "flex h-11 flex-col items-center justify-center rounded-[var(--radius-control)] text-2xs leading-tight transition-colors sm:text-xs",
                  on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {showQuestions && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Questões resolvidas" htmlFor="q-count" optional hint="Fora do banco do Vértice; as respondidas aqui já contam." error={errors?.questionsCount}>
            <Input type="number" inputMode="numeric" min={0} max={1000} value={value.questionsCount} onChange={(e) => set("questionsCount", e.target.value)} />
          </Field>
          <Field label="Acertos" htmlFor="q-correct" optional error={errors?.questionsCorrect}>
            <Input type="number" inputMode="numeric" min={0} max={1000} value={value.questionsCorrect} onChange={(e) => set("questionsCorrect", e.target.value)} />
          </Field>
        </div>
      )}

      {showContentCompleted && (
        <div className="flex items-start gap-2.5">
          <Checkbox id="content-completed" checked={value.contentCompleted} onCheckedChange={(v) => set("contentCompleted", v === true)} className="mt-0.5" />
          <Label htmlFor="content-completed" className="flex flex-col gap-0.5 text-base text-fg">
            Concluí o conteúdo deste tópico
            <span className="text-sm font-normal text-fg-subtle">Marca o tópico como estudado no edital e agenda a primeira revisão para amanhã.</span>
          </Label>
        </div>
      )}

      <Field label="Observações" htmlFor="session-notes" optional>
        <Textarea rows={3} value={value.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
      </Field>
    </div>
  );
}
