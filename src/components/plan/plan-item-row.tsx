"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, Check, CircleSlash, HelpCircle, MoreHorizontal, NotebookPen, Play, RotateCcw, SkipForward, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlay";
import { formatClock, formatDayKey, formatMinutes, formatPercent, parseClock } from "@/lib/format";
import { PLAN_ITEM_STATUS_LABEL, SLOT_CLASS_HINT, SLOT_CLASS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { PlanItemView } from "@/modules/plan/queries";
import {
  postponePlanItemAction,
  reschedulePlanItemAction,
  setPlanItemStatusAction,
  updatePlanItemNotesAction,
} from "@/modules/plan/actions";
import { logManualSessionAction, startSessionAction } from "@/modules/sessions/actions";
import { emptyOutcome, parseOutcome, SessionOutcomeFields, type Outcome } from "./session-outcome-fields";
import { planItemTitle } from "@/modules/plan/titles";

export const itemTitle = planItemTitle;

function itemMeta(item: PlanItemView) {
  const parts: string[] = [];
  if (item.kind === "NEW_CONTENT") parts.push("Teoria");
  else if (item.subjectName && item.kind !== "FLASHCARDS" && item.kind !== "ERROR_NOTEBOOK") parts.push(item.subjectName);
  parts.push(formatMinutes(item.endMinute - item.startMinute));
  return parts.join(", ");
}

export function statusView(item: PlanItemView): { label: string; tone: string; rail: string } {
  if (item.status === "PLANNED" && item.timing === "now") return { label: "Agora", tone: "text-performance", rail: "bg-performance" };
  switch (item.status) {
    case "DONE":
      return { label: PLAN_ITEM_STATUS_LABEL.DONE, tone: "text-positive", rail: "bg-positive" };
    case "IN_PROGRESS":
      return { label: PLAN_ITEM_STATUS_LABEL.IN_PROGRESS, tone: "text-performance", rail: "bg-performance" };
    case "MISSED":
      return { label: PLAN_ITEM_STATUS_LABEL.MISSED, tone: "text-danger", rail: "bg-danger" };
    case "SKIPPED":
    case "CANCELED":
    case "POSTPONED":
      return { label: PLAN_ITEM_STATUS_LABEL[item.status], tone: "text-fg-subtle", rail: "bg-line" };
    default:
      return { label: PLAN_ITEM_STATUS_LABEL.PLANNED, tone: "text-fg-subtle", rail: "bg-fg-faint" };
  }
}

export function WhyPopover({ item }: { item: PlanItemView }) {
  const reasons = item.reasons.length ? item.reasons : [{ code: "REASON", text: item.reason }];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline">
          <HelpCircle className="size-3.5" />
          Por quê?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium text-fg">{itemTitle(item)}</p>
          <ul className="flex flex-col gap-2">
            {reasons.map((r, i) => (
              <li key={`${r.code}-${i}`} className="text-sm text-fg-muted">
                {r.text}
              </li>
            ))}
          </ul>
          <div className="border-t pt-3 text-sm text-fg-subtle">
            Horário {item.slotClass} — {SLOT_CLASS_LABEL[item.slotClass].toLowerCase()}: {SLOT_CLASS_HINT[item.slotClass].toLowerCase()}.
            {item.accuracy !== null && item.accuracy !== undefined && <> Desempenho atual no tópico: {formatPercent(item.accuracy)}.</>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PlanItemRow({
  item,
  remainingDays,
  compact = false,
}: {
  item: PlanItemView;
  /** Days (today → Sunday) available for rescheduling. */
  remainingDays: string[];
  compact?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [dialog, setDialog] = React.useState<"complete" | "reschedule" | "notes" | null>(null);
  const status = statusView(item);
  const actionable = item.status === "PLANNED" || item.status === "MISSED";
  const inactive = ["SKIPPED", "CANCELED", "POSTPONED"].includes(item.status);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string } | undefined | void>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else if (result.message) toast.success(result.message);
    });

  return (
    <li className={cn("relative flex flex-col gap-2 py-3.5 pr-1 pl-4 sm:flex-row sm:items-center sm:gap-5", inactive && "opacity-60")}>
      <span aria-hidden="true" className={cn("absolute top-3.5 bottom-3.5 left-0 w-0.5 rounded-full", status.rail)} />
      <div className="numeral w-[5.5rem] shrink-0 text-base text-fg-muted">
        {formatClock(item.startMinute)}
        <span className="text-fg-faint">–{formatClock(item.endMinute)}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cn("truncate text-base font-medium text-fg", inactive && "line-through decoration-fg-faint")}>{itemTitle(item)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-fg-subtle">
          <span>{itemMeta(item)}</span>
          <span className={status.tone}>{status.label}</span>
          {item.rescheduledFrom && <span>Reagendada</span>}
          {!compact && <WhyPopover item={item} />}
        </div>
        {item.notes && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.notes}</p>}
      </div>

      <div className="flex items-center gap-1.5 self-end sm:self-auto">
        {compact && <WhyPopover item={item} />}
        {item.status === "IN_PROGRESS" && (
          <Button asChild size="sm" variant="primary">
            <Link href="/sessao">Abrir sessão</Link>
          </Button>
        )}
        {actionable && item.timing !== "past" && (
          <Button size="sm" variant={item.timing === "now" ? "primary" : "secondary"} loading={pending} onClick={() => run(() => startSessionAction({ planItemId: item.id }))}>
            <Play />
            Iniciar
          </Button>
        )}
        {actionable && (
          <Button size="sm" variant="outline" onClick={() => setDialog("complete")}>
            <Check />
            Concluir
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Mais ações para ${itemTitle(item)}`} disabled={pending}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {actionable && (
              <>
                {item.timing === "past" && (
                  <DropdownMenuItem onSelect={() => run(() => startSessionAction({ planItemId: item.id }))}>
                    <Play />
                    Iniciar agora
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => run(() => postponePlanItemAction(item.id))}>
                  <SkipForward />
                  Adiar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("reschedule")}>
                  <CalendarClock />
                  Reagendar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => setPlanItemStatusAction(item.id, "skip"))}>
                  <CircleSlash />
                  Ignorar
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => run(() => setPlanItemStatusAction(item.id, "cancel"))}>
                  <XCircle />
                  Cancelar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {(item.status === "SKIPPED" || item.status === "CANCELED") && (
              <DropdownMenuItem onSelect={() => run(() => setPlanItemStatusAction(item.id, "restore"))}>
                <RotateCcw />
                Restaurar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setDialog("notes")}>
              <NotebookPen />
              Observações
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CompleteDialog item={item} open={dialog === "complete"} onOpenChange={(o) => setDialog(o ? "complete" : null)} />
      <RescheduleDialog item={item} days={remainingDays} open={dialog === "reschedule"} onOpenChange={(o) => setDialog(o ? "reschedule" : null)} />
      <NotesDialog item={item} open={dialog === "notes"} onOpenChange={(o) => setDialog(o ? "notes" : null)} />
    </li>
  );
}

function CompleteDialog({ item, open, onOpenChange }: { item: PlanItemView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const planned = item.endMinute - item.startMinute;
  const [minutes, setMinutes] = React.useState(String(planned));
  const [outcome, setOutcome] = React.useState<Outcome>(emptyOutcome);
  const [error, setError] = React.useState<{ message: string; fields?: Record<string, string[] | undefined> } | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setMinutes(String(planned));
      setOutcome(emptyOutcome);
      setError(null);
    }
  }, [open, planned]);

  const past = item.timing === "past";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Concluir sessão"
        description={past ? `Registro de ${formatDayKey(item.dateKey, "dayMonth")}, ${formatClock(item.startMinute)}.` : "O tempo informado será registrado terminando agora."}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await logManualSessionAction({
                planItemId: item.id,
                kind: item.kind,
                endsNow: !past,
                dateKey: past ? item.dateKey : undefined,
                startMinute: past ? item.startMinute : undefined,
                minutes: Number(minutes),
                ...parseOutcome(outcome),
              });
              if (!result.ok) setError({ message: result.error, fields: result.fieldErrors });
              else {
                toast.success(result.message);
                onOpenChange(false);
              }
            });
          }}
        >
          <p className="text-base font-medium text-fg">{itemTitle(item)}</p>
          {error && !error.fields && <Notice tone="danger">{error.message}</Notice>}
          <Field label="Tempo efetivo (minutos)" htmlFor="complete-minutes" hint={`Previsto: ${formatMinutes(planned)}.`} error={error?.fields?.minutes}>
            <Input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="max-w-40" />
          </Field>
          <SessionOutcomeFields
            value={outcome}
            onChange={setOutcome}
            showContentCompleted={item.kind === "NEW_CONTENT" && !!item.topicId}
            showQuestions={item.kind !== "FLASHCARDS"}
            errors={error?.fields}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Registrar conclusão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ item, days, open, onOpenChange }: { item: PlanItemView; days: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [day, setDay] = React.useState(days[0] ?? "");
  const [time, setTime] = React.useState(formatClock(item.startMinute));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setDay(days.includes(item.dateKey) ? item.dateKey : (days[0] ?? ""));
      setTime(formatClock(item.startMinute));
      setError(null);
    }
  }, [open, days, item.dateKey, item.startMinute]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Reagendar sessão" description={`${itemTitle(item)} — ${formatMinutes(item.endMinute - item.startMinute)}`}>
        {days.length === 0 ? (
          <Notice tone="neutral">Não há mais dias nesta semana. A sessão entra no plano da próxima semana ao recalcular.</Notice>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              const start = parseClock(time);
              if (start === null) return setError("Horário inválido.");
              startTransition(async () => {
                const result = await reschedulePlanItemAction({ itemId: item.id, dateKey: day, startMinute: start });
                if (!result.ok) setError(result.error);
                else {
                  toast.success(result.message);
                  onOpenChange(false);
                }
              });
            }}
          >
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <Field label="Dia" htmlFor="res-day">
                <NativeSelect value={day} onChange={(e) => setDay(e.target.value)}>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {formatDayKey(d)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Início" htmlFor="res-time">
                <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
              </Field>
            </div>
            <p className="text-sm text-fg-subtle">O horário não pode coincidir com compromissos da rotina nem com outras sessões.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Reagendar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({ item, open, onOpenChange }: { item: PlanItemView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [notes, setNotes] = React.useState(item.notes ?? "");
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => {
    if (open) setNotes(item.notes ?? "");
  }, [open, item.notes]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Observações" description={itemTitle(item)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await updatePlanItemNotesAction(item.id, notes);
              if (!result.ok) toast.error(result.error);
              else {
                toast.success(result.message);
                onOpenChange(false);
              }
            });
          }}
        >
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} aria-label="Observações" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Salvar observação
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
