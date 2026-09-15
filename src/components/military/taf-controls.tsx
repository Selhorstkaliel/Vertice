"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Progress, Skeleton } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { MODALITY_LABEL } from "@/lib/labels";
import { formatMeasure } from "@/engines/military/taf";
import { addTafResultAction, deleteTafResultAction, deleteTafTestAction, saveTafTestAction, type TafTestInput } from "@/modules/military/actions";
import type { TafTestView } from "@/modules/military/service";
import { cn } from "@/lib/utils";

const TafEvolutionChart = dynamic(() => import("./taf-chart").then((m) => m.TafEvolutionChart), {
  ssr: false,
  loading: () => <Skeleton className="h-44" />,
});

type Unit = TafTestView["unit"];
type Modality = TafTestView["modality"];

const UNIT_OPTIONS: { value: Unit; label: string; betterWhen: "LOWER" | "HIGHER" }[] = [
  { value: "SECONDS", label: "Tempo (minutos e segundos)", betterWhen: "LOWER" },
  { value: "REPS", label: "Repetições", betterWhen: "HIGHER" },
  { value: "METERS", label: "Distância em metros", betterWhen: "HIGHER" },
  { value: "KILOGRAMS", label: "Carga em kg", betterWhen: "HIGHER" },
];

/** Suggested unit per modality; the student can change anything. */
const MODALITY_DEFAULTS: Record<Modality, { unit: Unit; name: string }> = {
  RUN: { unit: "SECONDS", name: "Corrida" },
  PULL_UP: { unit: "REPS", name: "Barra fixa" },
  PUSH_UP: { unit: "REPS", name: "Flexão de braços" },
  SIT_UP: { unit: "REPS", name: "Abdominal" },
  SWIM: { unit: "SECONDS", name: "Natação" },
  OTHER: { unit: "REPS", name: "" },
};

const measureHint = (unit: Unit) => (unit === "SECONDS" ? "Formato mm:ss, como 12:00." : unit === "REPS" ? "Número inteiro." : "Número positivo.");

interface EnrollmentOption {
  id: string;
  title: string;
}

interface TestForm {
  name: string;
  modality: Modality;
  unit: Unit;
  betterWhen: "LOWER" | "HIGHER";
  distance: string;
  target: string;
  enrollmentId: string;
  notes: string;
}

function toForm(test?: TafTestView): TestForm {
  if (!test) return { name: "Corrida", modality: "RUN", unit: "SECONDS", betterWhen: "LOWER", distance: "2400", target: "", enrollmentId: "", notes: "" };
  return {
    name: test.name,
    modality: test.modality,
    unit: test.unit,
    betterWhen: test.betterWhen,
    distance: test.distanceMeters ? String(test.distanceMeters) : "",
    target: test.targetValue !== null ? (test.unit === "SECONDS" ? formatMeasure(test.targetValue, "SECONDS") : String(test.targetValue)) : "",
    enrollmentId: test.enrollmentId ?? "",
    notes: test.notes ?? "",
  };
}

export function TafTestDialog({ test, enrollments, trigger }: { test?: TafTestView; enrollments: EnrollmentOption[]; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<TestForm>(toForm(test));
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof TestForm>(k: K, value: TestForm[K]) => setV((p) => ({ ...p, [k]: value }));
  const lockedUnit = !!test && test.results.length > 0;

  const submit = () => {
    const distance = v.distance.trim() ? Number(v.distance) : null;
    if (distance !== null && (!Number.isInteger(distance) || distance <= 0)) {
      setErrors({ distanceMeters: ["Informe a distância em metros, como 2400."] });
      return;
    }
    const payload: TafTestInput = {
      name: v.name,
      modality: v.modality,
      unit: v.unit,
      betterWhen: v.betterWhen,
      distanceMeters: distance,
      target: v.target,
      enrollmentId: v.enrollmentId || null,
      notes: v.notes,
    };
    startTransition(async () => {
      const r = await saveTafTestAction(test?.id ?? null, payload);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setMessage(r.fieldErrors ? null : r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(toForm(test));
          setErrors({});
          setMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Plus />
            Nova prova
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={test ? "Editar prova do TAF" : "Nova prova do TAF"} description="Use os índices do edital do seu concurso. O Vértice apenas registra; ele não define índices nem treinos.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {message && <Notice tone="danger">{message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modalidade" htmlFor="taf-modality">
              <NativeSelect
                value={v.modality}
                onChange={(e) => {
                  const modality = e.target.value as Modality;
                  const d = MODALITY_DEFAULTS[modality];
                  setV((p) => ({
                    ...p,
                    modality,
                    name: p.name === MODALITY_DEFAULTS[p.modality].name || !p.name ? d.name : p.name,
                    ...(lockedUnit ? {} : { unit: d.unit, betterWhen: UNIT_OPTIONS.find((u) => u.value === d.unit)!.betterWhen }),
                    distance: modality === "RUN" || modality === "SWIM" ? p.distance : "",
                  }));
                }}
              >
                {Object.entries(MODALITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Nome" htmlFor="taf-name" error={errors.name}>
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={60} />
            </Field>
            <Field label="Como medir" htmlFor="taf-unit" hint={lockedUnit ? "A unidade não muda depois de registrar resultados." : undefined}>
              <NativeSelect
                value={v.unit}
                disabled={lockedUnit}
                onChange={(e) => {
                  const unit = e.target.value as Unit;
                  setV((p) => ({ ...p, unit, betterWhen: UNIT_OPTIONS.find((u) => u.value === unit)!.betterWhen, target: "" }));
                }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Melhor resultado" htmlFor="taf-better">
              <NativeSelect value={v.betterWhen} onChange={(e) => set("betterWhen", e.target.value as "LOWER" | "HIGHER")}>
                <option value="LOWER">Menor valor</option>
                <option value="HIGHER">Maior valor</option>
              </NativeSelect>
            </Field>
            {(v.modality === "RUN" || v.modality === "SWIM" || v.distance) && (
              <Field label="Distância (m)" htmlFor="taf-distance" optional error={errors.distanceMeters}>
                <Input inputMode="numeric" value={v.distance} onChange={(e) => set("distance", e.target.value.replace(/\D/g, ""))} maxLength={6} />
              </Field>
            )}
            <Field label="Meta" htmlFor="taf-target" optional error={errors.target} hint={measureHint(v.unit)}>
              <Input value={v.target} onChange={(e) => set("target", e.target.value)} maxLength={10} placeholder={v.unit === "SECONDS" ? "12:00" : "10"} />
            </Field>
          </div>
          {enrollments.length > 0 && (
            <Field label="Concurso" htmlFor="taf-enrollment" optional>
              <NativeSelect value={v.enrollmentId} onChange={(e) => set("enrollmentId", e.target.value)}>
                <option value="">Sem concurso específico</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Observações" htmlFor="taf-notes" optional error={errors.notes}>
            <Textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {test ? "Salvar prova" : "Adicionar prova"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResultForm({ test, today }: { test: TafTestView; today: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = React.useTransition();
  const valueId = `taf-value-${test.id}`;
  const dateId = `taf-date-${test.id}`;

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addTafResultAction({ testId: test.id, value, date });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          setErrors({});
          setValue("");
          toast.success(r.message);
          router.refresh();
        });
      }}
    >
      <Field label="Resultado" htmlFor={valueId} error={errors.value} className="w-32">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={test.unit === "SECONDS" ? "13:20" : "10"} maxLength={10} />
      </Field>
      <Field label="Data" htmlFor={dateId} error={errors.date} className="w-40">
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" loading={pending} disabled={!value.trim() || !date}>
        Registrar
      </Button>
    </form>
  );
}

function DeleteTestButton({ test }: { test: TafTestView }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${test.name}`}>
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Excluir ${test.name}?`} description={`A prova e ${test.results.length === 1 ? "o resultado registrado" : `os ${test.results.length} resultados registrados`} serão removidos.`}>
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Manter prova
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteTafTestAction(test.id);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            Excluir prova
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveResultButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Remover resultado ${label}`}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await deleteTafResultAction(id);
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}

const dateBr = (key: string) => key.split("-").reverse().join("/");

export function TafTestCard({ test, enrollments, today }: { test: TafTestView; enrollments: EnrollmentOption[]; today: string }) {
  const s = test.summary;
  const unitLabel = (v: number) => formatMeasure(v, test.unit);
  const subtitle = [MODALITY_LABEL[test.modality], test.distanceMeters ? `${test.distanceMeters} m` : null, test.enrollmentTitle].filter(Boolean).join(", ");

  return (
    <article aria-labelledby={`taf-${test.id}`} className="flex flex-col gap-5 border-t pt-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 id={`taf-${test.id}`} className="text-md font-semibold">
            {test.name}
          </h3>
          <p className="text-sm text-fg-subtle">{subtitle}</p>
        </div>
        <div className="flex gap-1">
          <TafTestDialog
            test={test}
            enrollments={enrollments}
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label={`Editar ${test.name}`}>
                <Pencil />
              </Button>
            }
          />
          <DeleteTestButton test={test} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-fg-subtle">Atual</dt>
          <dd className="numeral text-xl font-light text-fg">{s.latest ? unitLabel(s.latest.value) : "—"}</dd>
          {s.latest && <dd className="text-sm text-fg-subtle">{dateBr(s.latest.dateKey)}</dd>}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-fg-subtle">Meta</dt>
          <dd className="numeral text-xl font-light text-fg">{test.targetValue !== null ? unitLabel(test.targetValue) : "—"}</dd>
          <dd className="text-sm text-fg-subtle">{test.targetValue !== null ? "Definida por você" : "Sem meta"}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-fg-subtle">Melhor marca</dt>
          <dd className="numeral text-xl font-light text-fg">{s.best ? unitLabel(s.best.value) : "—"}</dd>
          {s.best && <dd className="text-sm text-fg-subtle">{dateBr(s.best.dateKey)}</dd>}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-fg-subtle">Evolução</dt>
          <dd className={cn("numeral text-xl font-light", s.improvement === null ? "text-fg" : s.improvement > 0 ? "text-positive" : s.improvement < 0 ? "text-warning" : "text-fg")}>
            {s.improvement === null ? "—" : s.improvement === 0 ? "Igual" : `${s.improvement > 0 ? "+" : "−"}${unitLabel(Math.abs(s.improvement))}`}
          </dd>
          <dd className="text-sm text-fg-subtle">{s.improvement === null ? "A partir de 2 registros" : "Desde o primeiro registro"}</dd>
        </div>
      </dl>

      {s.targetMet !== null && s.progressToTarget !== null && (
        <div className="flex flex-col gap-1.5">
          <Progress value={s.progressToTarget} tone={s.targetMet ? "positive" : "info"} size="xs" label={`Progresso até a meta em ${test.name}`} />
          <p className="text-sm text-fg-muted">
            {s.targetMet ? "Meta alcançada no último registro." : `Faltam ${unitLabel(s.gapToTarget ?? 0)} para a meta.`}
          </p>
        </div>
      )}

      {test.results.length >= 2 ? (
        <TafEvolutionChart name={test.name} unit={test.unit} betterWhen={test.betterWhen} target={test.targetValue} results={test.results} />
      ) : (
        <p className="text-sm text-fg-subtle">{test.results.length === 0 ? "Registre o primeiro resultado para acompanhar a evolução." : "O gráfico de evolução aparece a partir do segundo registro."}</p>
      )}

      <ResultForm test={test} today={today} />

      {test.results.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-subtle select-none hover:text-fg">Registros ({test.results.length})</summary>
          <ul className="mt-2 flex flex-col">
            {[...test.results].reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 last:border-b-0">
                <span className="text-fg-muted">{dateBr(r.dateKey)}</span>
                <span className="numeral flex-1 text-right text-base text-fg">{r.label}</span>
                <RemoveResultButton id={r.id} label={`${r.label} de ${dateBr(r.dateKey)}`} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
