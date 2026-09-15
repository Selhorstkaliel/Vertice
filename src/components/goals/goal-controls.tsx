"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlay";
import { GOAL_KIND_LABEL, GOAL_PERIOD_LABEL } from "@/lib/labels";
import { deleteGoalAction, saveGoalAction, setGoalActiveAction, type GoalInput } from "@/modules/goals/actions";

type Kind = keyof typeof GOAL_KIND_LABEL;
type Period = keyof typeof GOAL_PERIOD_LABEL;

const SUBJECT_KINDS: Kind[] = ["HOURS", "QUESTIONS", "TOPICS", "FLASHCARDS", "REVIEWS"];

const SUGGESTED: Record<Kind, Record<Period, string>> = {
  HOURS: { DAILY: "3", WEEKLY: "20", MONTHLY: "80" },
  QUESTIONS: { DAILY: "30", WEEKLY: "200", MONTHLY: "800" },
  TOPICS: { DAILY: "1", WEEKLY: "5", MONTHLY: "20" },
  FLASHCARDS: { DAILY: "30", WEEKLY: "200", MONTHLY: "800" },
  SIMULATIONS: { DAILY: "1", WEEKLY: "1", MONTHLY: "4" },
  REVIEWS: { DAILY: "1", WEEKLY: "5", MONTHLY: "20" },
};

export interface GoalEditValues {
  id: string;
  kind: Kind;
  period: Period;
  target: number;
  subjectId: string | null;
}

export function GoalDialog({ goal, subjects, trigger }: { goal?: GoalEditValues; subjects: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const initial = () => ({
    kind: goal?.kind ?? ("QUESTIONS" as Kind),
    period: goal?.period ?? ("WEEKLY" as Period),
    target: goal ? String(goal.target).replace(".", ",") : "",
    subjectId: goal?.subjectId ?? "",
  });
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    const target = Number(v.target.replace(",", "."));
    const payload: GoalInput = {
      kind: v.kind,
      period: v.period,
      target: v.target.trim() && Number.isFinite(target) ? target : Number.NaN,
      subjectId: SUBJECT_KINDS.includes(v.kind) && v.subjectId ? v.subjectId : null,
    };
    startTransition(async () => {
      const r = await saveGoalAction(goal?.id ?? null, payload);
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
          setV(initial());
          setErrors({});
          setMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Plus />
            Nova meta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={goal ? "Editar meta" : "Nova meta"} description="O progresso é calculado a partir do que você registra na plataforma.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {message && <Notice tone="danger">{message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="O que medir" htmlFor="goal-kind">
              <NativeSelect value={v.kind} onChange={(e) => setV((p) => ({ ...p, kind: e.target.value as Kind }))}>
                {Object.entries(GOAL_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Período" htmlFor="goal-period">
              <NativeSelect value={v.period} onChange={(e) => setV((p) => ({ ...p, period: e.target.value as Period }))}>
                <option value="DAILY">Por dia</option>
                <option value="WEEKLY">Por semana (segunda a domingo)</option>
                <option value="MONTHLY">Por mês</option>
              </NativeSelect>
            </Field>
            <Field label={v.kind === "HOURS" ? "Meta em horas" : "Meta"} htmlFor="goal-target" error={errors.target} hint={`Exemplo: ${SUGGESTED[v.kind][v.period]} ${GOAL_PERIOD_LABEL[v.period]}.`}>
              <Input inputMode="decimal" value={v.target} onChange={(e) => setV((p) => ({ ...p, target: e.target.value }))} maxLength={7} autoFocus />
            </Field>
            {SUBJECT_KINDS.includes(v.kind) && subjects.length > 0 && (
              <Field label="Disciplina" htmlFor="goal-subject" optional error={errors.subjectId}>
                <NativeSelect value={v.subjectId} onChange={(e) => setV((p) => ({ ...p, subjectId: e.target.value }))}>
                  <option value="">Todas</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {goal ? "Salvar meta" : "Criar meta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GoalMenu({ goal, active, subjects, label }: { goal: GoalEditValues; active: boolean; subjects: { id: string; name: string }[]; label: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const editRef = React.useRef<HTMLButtonElement>(null);

  const run = (fn: () => ReturnType<typeof deleteGoalAction>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        after?.();
        router.refresh();
      }
    });

  return (
    <>
      <GoalDialog goal={goal} subjects={subjects} trigger={<button ref={editRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Opções da meta ${label}`} loading={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTimeout(() => editRef.current?.click(), 0)}>Editar</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setGoalActiveAction(goal.id, !active))}>{active ? "Pausar" : "Retomar"}</DropdownMenuItem>
          <DropdownMenuItem className="text-danger" onSelect={() => setTimeout(() => setConfirm(true), 0)}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Excluir meta?" description={`“${label}” será removida. O histórico de estudo não é afetado.`}>
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Manter meta
            </Button>
            <Button variant="danger" loading={pending} onClick={() => run(() => deleteGoalAction(goal.id), () => setConfirm(false))}>
              Excluir meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
