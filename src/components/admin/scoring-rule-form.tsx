"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { deleteScoringRuleAction, saveScoringRuleAction } from "@/modules/scoring/actions";
import type { RuleSubject } from "@/engines/simulations/scoring";

export interface RuleCompetition {
  id: string;
  name: string;
  subjects: { id: string; name: string; questionCount: number | null }[];
}

export interface RuleFormInitial {
  id?: string;
  competitionId: string;
  year: number | null;
  mode: "RIGHT_COUNT" | "PENALTY";
  wrongPenalty: number | null;
  durationMinutes: number | null;
  subjects: RuleSubject[];
  minTotalShare: number | null;
  cutoffScore: number | null;
  maxScore: number | null;
  sourceUrl: string | null;
  sourceNote: string | null;
  verified: boolean;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function ScoringRuleForm({ competitions, initial }: { competitions: RuleCompetition[]; initial?: RuleFormInitial }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [competitionId, setCompetitionId] = React.useState(initial?.competitionId ?? "");
  const [year, setYear] = React.useState(str(initial?.year));
  const [mode, setMode] = React.useState<"RIGHT_COUNT" | "PENALTY">(initial?.mode ?? "RIGHT_COUNT");
  const [penalty, setPenalty] = React.useState(str(initial?.wrongPenalty));
  const [duration, setDuration] = React.useState(str(initial?.durationMinutes));
  const [minTotal, setMinTotal] = React.useState(initial?.minTotalShare !== null && initial?.minTotalShare !== undefined ? String(initial.minTotalShare * 100) : "");
  const [cutoff, setCutoff] = React.useState(str(initial?.cutoffScore));
  const [max, setMax] = React.useState(str(initial?.maxScore));
  const [sourceUrl, setSourceUrl] = React.useState(initial?.sourceUrl ?? "");
  const [sourceNote, setSourceNote] = React.useState(initial?.sourceNote ?? "");
  const [verified, setVerified] = React.useState(initial?.verified ?? false);
  const competition = competitions.find((c) => c.id === competitionId);
  const [rows, setRows] = React.useState<Record<string, { weight: string; questions: string; minShare: string }>>(() =>
    Object.fromEntries(
      (initial?.subjects ?? []).map((s) => [s.subjectId, { weight: String(s.weight), questions: str(s.questions), minShare: s.minShare !== null && s.minShare !== undefined ? String(s.minShare * 100) : "" }]),
    ),
  );
  const row = (id: string) => rows[id] ?? { weight: "", questions: "", minShare: "" };
  const setRow = (id: string, patch: Partial<{ weight: string; questions: string; minShare: string }>) => setRows((r) => ({ ...r, [id]: { ...row(id), ...patch } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subjects = (competition?.subjects ?? [])
      .map((s) => ({ s, r: row(s.id) }))
      .filter(({ r }) => r.weight.trim() !== "")
      .map(({ s, r }) => ({
        subjectId: s.id,
        weight: Number(r.weight.replace(",", ".")),
        questions: num(r.questions),
        minShare: r.minShare.trim() === "" ? null : Number(r.minShare.replace(",", ".")) / 100,
      }));
    startTransition(async () => {
      const r = await saveScoringRuleAction({
        id: initial?.id,
        competitionId,
        year: num(year),
        mode,
        wrongPenalty: num(penalty),
        durationMinutes: num(duration),
        subjects,
        minTotalShare: minTotal.trim() === "" ? null : Number(minTotal.replace(",", ".")) / 100,
        cutoffScore: num(cutoff),
        maxScore: num(max),
        sourceUrl,
        sourceNote,
        verified,
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      setErrors({});
      toast.success(r.message);
      router.push("/admin/regras");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Concurso" htmlFor="rule-competition" error={errors.competitionId}>
          <NativeSelect value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} disabled={!!initial?.id}>
            <option value="">Escolha</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ano do edital" htmlFor="rule-year" error={errors.year} optional>
          <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pontuação" htmlFor="rule-mode">
          <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="RIGHT_COUNT">Acertos (sem desconto)</option>
            <option value="PENALTY">Certo/errado com desconto</option>
          </NativeSelect>
        </Field>
        {mode === "PENALTY" && (
          <Field label="Acertos anulados por erro" htmlFor="rule-penalty" error={errors.wrongPenalty} hint="Cebraspe: 1">
            <Input inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </Field>
        )}
        <Field label="Tempo da prova (min)" htmlFor="rule-duration" error={errors.durationMinutes} optional>
          <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </div>

      {competition && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg-muted">Disciplinas (deixe o peso vazio para ficar fora da regra)</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] gap-2 text-sm text-fg-subtle">
            <span>Disciplina</span>
            <span>Peso</span>
            <span>Questões</span>
            <span>Mínimo %</span>
          </div>
          {competition.subjects.map((s) => (
            <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] items-center gap-2">
              <span className="truncate text-base text-fg">{s.name}</span>
              <Input aria-label={`Peso de ${s.name}`} inputMode="decimal" value={row(s.id).weight} onChange={(e) => setRow(s.id, { weight: e.target.value })} />
              <Input
                aria-label={`Questões de ${s.name}`}
                inputMode="numeric"
                value={row(s.id).questions}
                placeholder={s.questionCount ? String(s.questionCount) : ""}
                onChange={(e) => setRow(s.id, { questions: e.target.value })}
              />
              <Input aria-label={`Mínimo em ${s.name}`} inputMode="decimal" value={row(s.id).minShare} onChange={(e) => setRow(s.id, { minShare: e.target.value })} />
            </div>
          ))}
          {errors.subjects && <p className="text-sm text-danger">{errors.subjects[0]}</p>}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Mínimo no total (%)" htmlFor="rule-min-total" error={errors.minTotalShare} optional>
          <Input inputMode="decimal" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} />
        </Field>
        <Field label="Nota de corte" htmlFor="rule-cutoff" error={errors.cutoffScore} optional>
          <Input inputMode="decimal" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </Field>
        <Field label="Nota máxima da prova" htmlFor="rule-max" error={errors.maxScore} optional>
          <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
      </div>

      <Field label="Link do edital" htmlFor="rule-source" error={errors.sourceUrl} optional>
        <Input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Observação sobre a fonte" htmlFor="rule-note" error={errors.sourceNote} optional hint="Ex.: item 7.3 do edital; nota de corte divulgada pela banca em 12/2025.">
        <Textarea rows={2} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-base text-fg">
        <Switch checked={verified} onCheckedChange={setVerified} />
        Conferi estes dados no edital do ano informado
      </label>
      {!verified && <p className="-mt-3 text-sm text-fg-subtle">Sem essa confirmação, os alunos veem a regra como “Informação não verificada”.</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {initial?.id ? "Salvar regra" : "Cadastrar regra"}
        </Button>
        {initial?.id && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteScoringRuleAction(initial.id!);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message);
                  router.push("/admin/regras");
                  router.refresh();
                }
              })
            }
          >
            Remover
          </Button>
        )}
      </div>
    </form>
  );
}
