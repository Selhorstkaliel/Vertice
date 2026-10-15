"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Notice } from "@/components/ui/display";
import { Field, Input, Label, NativeSelect } from "@/components/ui/input";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createSimulationAction } from "@/modules/simulations/actions";

type Option = { id: string; name: string };

export interface CompetitionRuleInfo {
  mode: "RIGHT_COUNT" | "PENALTY";
  wrongPenalty: number | null;
  durationMinutes: number | null;
  officialQuestions: number | null;
  verified: boolean;
  year: number | null;
}

export function SimulationForm({
  competitions,
  boards,
  subjects,
  defaults,
}: {
  competitions: (Option & { subjectIds: string[]; rule: CompetitionRuleInfo | null })[];
  boards: Option[];
  subjects: (Option & { available: number })[];
  defaults: { competitionId: string | null };
}) {
  const defaultCompetition = competitions.find((c) => c.id === defaults.competitionId);
  const [title, setTitle] = React.useState(defaultCompetition ? `Simulado ${defaultCompetition.name}` : "Simulado");
  const [competitionId, setCompetitionId] = React.useState(defaultCompetition?.id ?? "");
  const [examBoardId, setExamBoardId] = React.useState("");
  const [subjectIds, setSubjectIds] = React.useState<string[]>(
    defaultCompetition ? subjects.filter((s) => defaultCompetition.subjectIds.includes(s.id)).map((s) => s.id) : [],
  );
  const [difficulty, setDifficulty] = React.useState("");
  const [count, setCount] = React.useState("20");
  const [minutes, setMinutes] = React.useState("60");
  const [timed, setTimed] = React.useState(true);
  const [preferUnanswered, setPreferUnanswered] = React.useState(true);
  const [examMode, setExamMode] = React.useState(false);
  const rule = competitions.find((c) => c.id === competitionId)?.rule ?? null;
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const available = subjects.filter((s) => subjectIds.includes(s.id)).reduce((a, s) => a + s.available, 0);

  const pickCompetition = (id: string) => {
    setCompetitionId(id);
    if (!id) setExamMode(false);
    const c = competitions.find((x) => x.id === id);
    if (c) {
      setSubjectIds(subjects.filter((s) => c.subjectIds.includes(s.id)).map((s) => s.id));
      setTitle(`Simulado ${c.name}`);
    }
  };

  return (
    <form
      className="flex max-w-3xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createSimulationAction({
            title,
            competitionId: competitionId || undefined,
            examBoardId: examBoardId || undefined,
            subjectIds,
            difficulty: (difficulty || null) as "EASY" | "MEDIUM" | "HARD" | null,
            questionCount: Number(count),
            timeLimitMinutes: timed || (examMode && !rule?.durationMinutes) ? Number(minutes) : null,
            preferUnanswered,
            examMode,
          });
          if (r && !r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.fieldErrors ? null : r.error);
          }
        });
      }}
    >
      {message && <Notice tone="danger">{message}</Notice>}

      <Field label="Nome" htmlFor="sim-title" error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Concurso" htmlFor="sim-competition" optional>
          <NativeSelect value={competitionId} onChange={(e) => pickCompetition(e.target.value)}>
            <option value="">Qualquer</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Banca" htmlFor="sim-board" optional>
          <NativeSelect value={examBoardId} onChange={(e) => setExamBoardId(e.target.value)}>
            <option value="">Qualquer</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dificuldade" htmlFor="sim-difficulty" optional>
          <NativeSelect value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Misturada</option>
            {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-medium text-fg-muted">
          <span>Matérias</span>
          <span className="font-normal text-fg-subtle">{available} questões disponíveis nas selecionadas</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => {
            const on = subjectIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={s.available === 0}
                onClick={() => setSubjectIds((list) => (on ? list.filter((x) => x !== s.id) : [...list, s.id]))}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-base transition-colors disabled:opacity-40",
                  on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
                )}
              >
                {on && <Check className="size-3.5" />}
                {s.name}
                <span className={cn("numeral text-sm", on ? "text-canvas/70" : "text-fg-subtle")}>{s.available}</span>
              </button>
            );
          })}
        </div>
        {errors.subjectIds && <p className="text-sm text-danger">{errors.subjectIds[0]}</p>}
      </fieldset>

      {competitionId && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] bg-surface px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Checkbox id="sim-exam" checked={examMode} onCheckedChange={(v) => setExamMode(v === true)} className="mt-0.5" />
            <Label htmlFor="sim-exam" className="flex flex-col gap-0.5 text-base text-fg">
              Modo prova
              <span className="text-sm font-normal text-fg-subtle">
                Número de questões e tempo do edital, nota pela regra do concurso, resolução só no final e opção de deixar em branco.
              </span>
            </Label>
          </div>
          <p className="text-sm text-fg-subtle">
            {rule
              ? `Regra ${rule.year ?? ""}: ${rule.mode === "PENALTY" ? `cada erro anula ${rule.wrongPenalty ?? 1} acerto(s)` : "acertos, sem desconto"}${rule.durationMinutes ? `, ${rule.durationMinutes} min` : ", tempo não cadastrado"}${rule.officialQuestions ? `, ${rule.officialQuestions} questões` : ""}.${rule.verified ? "" : " Informação não verificada."}`
              : "Este concurso ainda não tem regra de pontuação cadastrada: a nota será por acertos, e o tempo é o que você informar."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantidade de questões" htmlFor="sim-count" error={errors.questionCount}>
          <Input type="number" inputMode="numeric" min={3} max={120} value={examMode && rule?.officialQuestions ? String(Math.min(120, rule.officialQuestions)) : count} disabled={examMode && !!rule?.officialQuestions} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Field label="Tempo (minutos)" htmlFor="sim-minutes" error={errors.timeLimitMinutes}>
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            value={examMode && rule?.durationMinutes ? String(rule.durationMinutes) : minutes}
            disabled={examMode ? !!rule?.durationMinutes : !timed}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </Field>
        <div className="flex items-end pb-2.5">
          <div className="flex items-center gap-2.5">
            <Checkbox id="sim-timed" checked={timed || examMode} disabled={examMode} onCheckedChange={(v) => setTimed(v === true)} />
            <Label htmlFor="sim-timed" className="text-base text-fg">
              Com tempo limite
            </Label>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox id="sim-fresh" checked={preferUnanswered} onCheckedChange={(v) => setPreferUnanswered(v === true)} className="mt-0.5" />
        <Label htmlFor="sim-fresh" className="flex flex-col gap-0.5 text-base text-fg">
          Priorizar questões nunca respondidas
          <span className="text-sm font-normal text-fg-subtle">As questões são distribuídas de forma equilibrada entre as matérias escolhidas.</span>
        </Label>
      </div>

      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={subjectIds.length === 0}>
          Iniciar simulado
        </Button>
        <p className="text-sm text-fg-subtle">O gabarito só é exibido ao finalizar. Com tempo limite, o cronômetro continua mesmo se você sair da página.</p>
      </div>
    </form>
  );
}
