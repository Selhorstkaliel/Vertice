"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Notice } from "@/components/ui/display";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { deleteCalendarEventAction, saveCalendarEventAction, type CalendarEventInput } from "@/modules/calendar/actions";
import { formatClock } from "@/lib/format";

export const EVENT_TYPE_OPTIONS = [
  { value: "CUSTOM", label: "Evento pessoal" },
  { value: "EXAM", label: "Prova" },
  { value: "REGISTRATION", label: "Inscrição" },
  { value: "EDITAL", label: "Edital" },
  { value: "SIMULATION", label: "Simulado agendado" },
  { value: "TAF", label: "TAF" },
  { value: "GOAL", label: "Meta" },
] as const;

type EventType = (typeof EVENT_TYPE_OPTIONS)[number]["value"];

export interface EditableEvent {
  id: string;
  type: EventType;
  title: string;
  dateKey: string;
  startMinute: number | null;
  endMinute: number | null;
  description: string | null;
  competitionId: string | null;
  allDay: boolean;
}

export function EventDialog({
  event,
  defaultDate,
  competitions,
  trigger,
}: {
  event?: EditableEvent;
  defaultDate: string;
  competitions: { id: string; title: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const initial = () => ({
    type: (event?.type ?? "CUSTOM") as EventType,
    title: event?.title ?? "",
    date: event?.dateKey ?? defaultDate,
    allDay: event?.allDay ?? false,
    start: event?.startMinute !== null && event?.startMinute !== undefined ? formatClock(event.startMinute) : "09:00",
    end: event?.endMinute !== null && event?.endMinute !== undefined ? formatClock(event.endMinute) : "",
    description: event?.description ?? "",
    competitionId: event?.competitionId ?? "",
  });
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof ReturnType<typeof initial>>(k: K, value: ReturnType<typeof initial>[K]) => setV((p) => ({ ...p, [k]: value }));

  const finish = (r: { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string[] | undefined> }) => {
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setMessage(r.fieldErrors ? null : (r.error ?? null));
      return;
    }
    toast.success(r.message);
    setOpen(false);
    router.refresh();
  };

  const submit = () => {
    const payload: CalendarEventInput = {
      type: v.type,
      title: v.title,
      date: v.date,
      allDay: v.allDay,
      start: v.allDay ? undefined : v.start,
      end: v.allDay ? undefined : v.end || undefined,
      description: v.description,
      competitionId: v.competitionId || null,
    };
    startTransition(async () => finish(await saveCalendarEventAction(event?.id ?? null, payload)));
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
            Novo evento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={event ? "Editar evento" : "Novo evento"} description="Eventos criados por você. Sessões, revisões, provas e resultados entram no calendário automaticamente.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {message && <Notice tone="danger">{message}</Notice>}
          <Field label="Título" htmlFor="ev-title" error={errors.title}>
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={100} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="ev-type">
              <NativeSelect value={v.type} onChange={(e) => set("type", e.target.value as EventType)}>
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Data" htmlFor="ev-date" error={errors.date}>
              <Input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ev-allday" checked={v.allDay} onCheckedChange={(c) => set("allDay", c === true)} />
            <Label htmlFor="ev-allday">Dia inteiro</Label>
          </div>
          {!v.allDay && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início" htmlFor="ev-start" error={errors.start}>
                <Input type="time" value={v.start} onChange={(e) => set("start", e.target.value)} />
              </Field>
              <Field label="Fim" htmlFor="ev-end" optional error={errors.end}>
                <Input type="time" value={v.end} onChange={(e) => set("end", e.target.value)} />
              </Field>
            </div>
          )}
          {competitions.length > 0 && (
            <Field label="Concurso" htmlFor="ev-competition" optional>
              <NativeSelect value={v.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
                <option value="">Nenhum</option>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Descrição" htmlFor="ev-description" optional error={errors.description}>
            <Textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} />
          </Field>
          {(v.type === "EXAM" || v.type === "REGISTRATION" || v.type === "EDITAL") && (
            <p className="text-sm text-fg-subtle">Datas de edital informadas por você aparecem como não oficiais. Confira sempre o edital publicado.</p>
          )}
          <DialogFooter className="mt-2 sm:justify-between">
            {event ? (
              <Button type="button" variant="danger" disabled={pending} onClick={() => startTransition(async () => finish(await deleteCalendarEventAction(event.id)))}>
                Excluir evento
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                {event ? "Salvar evento" : "Criar evento"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
