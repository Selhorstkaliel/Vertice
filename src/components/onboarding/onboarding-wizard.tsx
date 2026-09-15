"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, Checkbox } from "@/components/ui/controls";
import { Field, Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Notice, Progress } from "@/components/ui/display";
import { completeOnboardingAction, type OnboardingInput } from "@/modules/onboarding/actions";
import { cn } from "@/lib/utils";

interface CompetitionOption {
  id: string;
  name: string;
  organization: string;
  position: string | null;
  kind: "PUBLIC" | "MILITARY";
  examDate: string | null;
  subjects: { id: string; name: string }[];
}

type Track = "PUBLIC" | "MILITARY" | "BOTH";
type YesNo = "yes" | "no";

const STEPS = ["track", "competition", "date", "hours", "hard", "work", "college", "physical"] as const;
type Step = (typeof STEPS)[number];

const yesNo = [
  { value: "yes" as const, label: "Sim" },
  { value: "no" as const, label: "Não" },
];

export function OnboardingWizard({
  competitions,
  subjects,
}: {
  competitions: CompetitionOption[];
  subjects: { id: string; name: string }[];
}) {
  const [step, setStep] = React.useState<Step>("track");
  const [track, setTrack] = React.useState<Track>();
  const [competitionId, setCompetitionId] = React.useState<string>();
  const [custom, setCustom] = React.useState(false);
  const [customName, setCustomName] = React.useState("");
  const [customOrg, setCustomOrg] = React.useState("");
  const [customKind, setCustomKind] = React.useState<"PUBLIC" | "MILITARY">("PUBLIC");
  const [search, setSearch] = React.useState("");
  const [examDate, setExamDate] = React.useState("");
  const [noDate, setNoDate] = React.useState(false);
  const [hours, setHours] = React.useState("");
  const [hard, setHard] = React.useState<string[]>([]);
  const [works, setWorks] = React.useState<YesNo>();
  const [college, setCollege] = React.useState<YesNo>();
  const [physical, setPhysical] = React.useState<YesNo>();
  const [goal, setGoal] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const index = STEPS.indexOf(step);
  const selected = competitions.find((c) => c.id === competitionId);
  const today = new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const filtered = competitions.filter((c) => {
    if (track === "PUBLIC" && c.kind !== "PUBLIC") return false;
    if (track === "MILITARY" && c.kind !== "MILITARY") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.organization, c.position ?? ""].some((v) => v.toLowerCase().includes(q));
  });

  const hardOptions = selected?.subjects.length ? selected.subjects : subjects;

  const canContinue: Record<Step, boolean> = {
    track: !!track,
    competition: custom ? customName.trim().length >= 2 && customOrg.trim().length >= 2 : !!competitionId,
    date: noDate || !!selected?.examDate || (!!examDate && examDate >= today),
    hours: Number(hours) >= 1 && Number(hours) <= 80,
    hard: true,
    work: !!works,
    college: !!college,
    physical: !!physical,
  };

  const next = () => {
    setError(null);
    if (index < STEPS.length - 1) setStep(STEPS[index + 1]!);
    else submit();
  };
  const back = () => {
    setError(null);
    if (index > 0) setStep(STEPS[index - 1]!);
  };

  function submit() {
    const payload: OnboardingInput = {
      track: track!,
      competitionId: custom ? undefined : competitionId,
      customCompetition: custom ? { name: customName, organization: customOrg, kind: customKind } : undefined,
      examDate: noDate || selected?.examDate ? null : examDate || null,
      weeklyHours: Number(hours),
      hardSubjectIds: hard,
      works: works === "yes",
      studiesCollege: college === "yes",
      physicalPrep: physical === "yes",
      goal: goal.trim() || undefined,
    };
    startTransition(async () => {
      const result = await completeOnboardingAction(payload);
      if (result && !result.ok) {
        setError(result.error);
        const fields = Object.keys(result.fieldErrors ?? {});
        if (fields.includes("competitionId")) setStep("competition");
        else if (fields.includes("examDate")) setStep("date");
        else if (fields.includes("weeklyHours")) setStep("hours");
      }
    });
  }

  const questions: Record<Step, string> = {
    track: "Para qual tipo de concurso você está estudando?",
    competition: "Qual é seu concurso principal?",
    date: "Quando será sua prova?",
    hours: "Quantas horas você acredita conseguir estudar por semana?",
    hard: "Quais matérias você considera mais difíceis?",
    work: "Você trabalha?",
    college: "Você estuda ou faz faculdade?",
    physical: "Tem preparação física?",
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue[step] && !pending) next();
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-fg-subtle">
          <span>
            Etapa {index + 1} de {STEPS.length}
          </span>
        </div>
        <Progress value={index + 1} max={STEPS.length} tone="neutral" size="xs" label="Progresso do questionário" />
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-[-0.025em] outline-none sm:text-[2.375rem] sm:leading-[1.1]">
        {questions[step]}
      </h1>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="min-h-48">
        {step === "track" && (
          <ChoiceGroup<Track>
            aria-label={questions.track}
            value={track}
            onValueChange={(v) => {
              setTrack(v);
              setCompetitionId(undefined);
              if (v !== "BOTH") setCustomKind(v);
            }}
            options={[
              { value: "PUBLIC", label: "Público", description: "Tribunais, polícias, bancos, fiscais, administrativos" },
              { value: "MILITARY", label: "Militar", description: "Escolas militares, Forças Armadas, Marinha Mercante" },
              { value: "BOTH", label: "Ambos", description: "Você se prepara para os dois tipos" },
            ]}
          />
        )}

        {step === "competition" && (
          <div className="flex flex-col gap-4">
            {!custom ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar concurso ou órgão"
                    className="pl-9"
                    aria-label="Pesquisar concurso"
                  />
                </div>
                <div role="radiogroup" aria-label="Concursos" className="scrollbar-thin -mx-1 flex max-h-80 flex-col overflow-y-auto px-1">
                  {filtered.map((c) => {
                    const checked = c.id === competitionId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => setCompetitionId(c.id)}
                        className={cn(
                          "flex items-center justify-between gap-4 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition-colors",
                          checked ? "bg-surface" : "hover:bg-surface/60",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="text-base font-medium text-fg">{c.name}</span>
                          <span className="truncate text-sm text-fg-subtle">
                            {c.organization}
                            {c.position ? ` — ${c.position}` : ""}
                          </span>
                        </span>
                        {checked && <Check className="size-4 shrink-0 text-fg" />}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && <p className="px-3 py-6 text-base text-fg-muted">Nenhum concurso encontrado.</p>}
                </div>
                <Button type="button" variant="link" className="self-start" onClick={() => setCustom(true)}>
                  Meu concurso não está na lista
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                <Field label="Nome do concurso" htmlFor="c-name">
                  <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ex.: Prefeitura de Campinas — Guarda Municipal" />
                </Field>
                <Field label="Órgão" htmlFor="c-org">
                  <Input value={customOrg} onChange={(e) => setCustomOrg(e.target.value)} />
                </Field>
                <Field label="Tipo" htmlFor="c-kind">
                  <NativeSelect value={customKind} onChange={(e) => setCustomKind(e.target.value as "PUBLIC" | "MILITARY")}>
                    <option value="PUBLIC">Público</option>
                    <option value="MILITARY">Militar</option>
                  </NativeSelect>
                </Field>
                <p className="text-sm text-fg-subtle">Depois você adiciona as disciplinas e os conteúdos do edital em Meus Concursos.</p>
                <Button type="button" variant="link" className="self-start" onClick={() => setCustom(false)}>
                  Voltar para a lista
                </Button>
              </div>
            )}
            {selected && !custom && (
              <Notice tone="neutral">
                A estrutura de {selected.name} no Vértice é uma referência não verificada. Confirme disciplinas e conteúdos no edital oficial.
              </Notice>
            )}
          </div>
        )}

        {step === "date" && (
          <div className="flex flex-col gap-4">
            {selected?.examDate ? (
              <p className="text-md text-fg-muted">Data oficial registrada: {selected.examDate.split("-").reverse().join("/")}.</p>
            ) : (
              <>
                <Field label="Data da prova" htmlFor="exam-date">
                  <Input type="date" value={examDate} min={today} disabled={noDate} onChange={(e) => setExamDate(e.target.value)} className="max-w-56" />
                </Field>
                <div className="flex items-center gap-2.5">
                  <Checkbox id="no-date" checked={noDate} onCheckedChange={(v) => setNoDate(v === true)} />
                  <Label htmlFor="no-date" className="text-base text-fg">
                    Data ainda não definida.
                  </Label>
                </div>
              </>
            )}
          </div>
        )}

        {step === "hours" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <Field label="Horas por semana" htmlFor="hours" className="w-40">
                <Input type="number" inputMode="numeric" min={1} max={80} value={hours} onChange={(e) => setHours(e.target.value)} className="numeral text-lg" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Sugestões">
              {[8, 12, 17, 25, 35].map((h) => (
                <Button key={h} type="button" size="sm" variant={Number(hours) === h ? "secondary" : "outline"} onClick={() => setHours(String(h))}>
                  {h}h
                </Button>
              ))}
            </div>
            <p className="text-sm text-fg-subtle">Seja realista. O Vértice compara esse número com a sua rotina e ajusta a carga recomendada.</p>
          </div>
        )}

        {step === "hard" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {hardOptions.map((s) => {
                const on = hard.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setHard((list) => (on ? list.filter((id) => id !== s.id) : [...list, s.id]))}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-base transition-colors",
                      on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-fg-subtle">
              Opcional. Enquanto não houver questões respondidas, essas matérias recebem um pouco mais de prioridade.
            </p>
          </div>
        )}

        {step === "work" && <ChoiceGroup<YesNo> aria-label={questions.work} value={works} onValueChange={setWorks} options={yesNo} columns={2} />}
        {step === "college" && <ChoiceGroup<YesNo> aria-label={questions.college} value={college} onValueChange={setCollege} options={yesNo} columns={2} />}
        {step === "physical" && (
          <div className="flex flex-col gap-6">
            <ChoiceGroup<YesNo> aria-label={questions.physical} value={physical} onValueChange={setPhysical} options={yesNo} columns={2} />
            {(track === "MILITARY" || track === "BOTH") && (
              <p className="text-sm text-fg-subtle">A área Militar / TAF registra suas marcas e metas. Ela não substitui orientação de um profissional de educação física.</p>
            )}
            <Field label="Seu objetivo, em uma frase" htmlFor="goal" optional>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={200} placeholder="Ex.: Aprovação na EFOMM em 2027" />
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-6">
        <Button type="button" variant="ghost" onClick={back} disabled={index === 0 || pending}>
          Voltar
        </Button>
        <div className="flex items-center gap-3">
          {step === "hard" && hard.length === 0 && <Badge tone="outline">Nenhuma selecionada</Badge>}
          <Button type="submit" variant="primary" size="lg" disabled={!canContinue[step]} loading={pending}>
            {index === STEPS.length - 1 ? "Configurar rotina" : "Continuar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
