"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/controls";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Notice } from "@/components/ui/display";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { ENERGY_LABEL, ROUTINE_CATEGORY_LABEL } from "@/lib/labels";
import { formatClock, parseClock, WEEKDAY_SHORT } from "@/lib/format";
import { deleteRoutineBlockAction, saveRoutineBlockAction } from "@/modules/routine/actions";
import type { EnergyLevel, RoutineCategory } from "@/engines/types";
import { cn } from "@/lib/utils";

export interface EditableBlock {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  category: RoutineCategory;
  label: string | null;
  isFixed: boolean;
  energy: EnergyLevel | null;
}

export function BlockDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: EditableBlock | null;
}) {
  const editing = !!initial?.id;
  const [days, setDays] = React.useState<number[]>([]);
  const [category, setCategory] = React.useState<RoutineCategory>("WORK");
  const [label, setLabel] = React.useState("");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("12:00");
  const [fixed, setFixed] = React.useState<"fixed" | "flexible">("fixed");
  const [energy, setEnergy] = React.useState<EnergyLevel | "">("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open || !initial) return;
    setDays([initial.dayOfWeek]);
    setCategory(initial.category);
    setLabel(initial.label ?? "");
    setStart(formatClock(initial.startMinute));
    setEnd(formatClock(initial.endMinute === 1440 ? 0 : initial.endMinute));
    setFixed(initial.isFixed ? "fixed" : "flexible");
    setEnergy(initial.energy ?? "");
    setError(null);
  }, [open, initial]);

  const startMin = parseClock(start);
  const endMin = parseClock(end);
  const overnight = startMin !== null && endMin !== null && endMin <= startMin && endMin !== 0;
  const availableCategory = category === "STUDY" || category === "FREE";

  function save() {
    if (startMin === null || endMin === null) {
      setError("Informe horários válidos.");
      return;
    }
    startTransition(async () => {
      const result = await saveRoutineBlockAction({
        id: initial?.id,
        days,
        startMinute: startMin,
        endMinute: endMin === 0 ? 1440 : endMin,
        category,
        label: label || undefined,
        isFixed: fixed === "fixed",
        energy: availableCategory && energy ? energy : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  function remove() {
    if (!initial?.id) return;
    startTransition(async () => {
      const result = await deleteRoutineBlockAction(initial.id!);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar bloco" : "Novo bloco"} description="Compromissos fixos nunca são movidos pelo plano.">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {error && <Notice tone="danger">{error}</Notice>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria" htmlFor="block-category">
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as RoutineCategory)}>
                {Object.entries(ROUTINE_CATEGORY_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Descrição" htmlFor="block-label" optional>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Ex.: Estágio" />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-fg-muted">{editing ? "Dia" : "Dias"}</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((name, i) => {
                const d = i + 1;
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays((list) => (editing ? [d] : on ? list.filter((x) => x !== d) : [...list, d].sort()))}
                    className={cn(
                      "h-9 w-12 rounded-[var(--radius-control)] text-sm font-medium transition-colors",
                      on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {!editing && (
              <div className="flex gap-3 text-sm">
                <button type="button" className="text-fg-subtle underline-offset-4 hover:text-fg hover:underline" onClick={() => setDays([1, 2, 3, 4, 5])}>
                  Dias úteis
                </button>
                <button type="button" className="text-fg-subtle underline-offset-4 hover:text-fg hover:underline" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
                  Todos
                </button>
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Início" htmlFor="block-start">
              <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="Fim" htmlFor="block-end" hint={overnight ? "Continua no dia seguinte." : undefined}>
              <Input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
          </div>

          <ChoiceGroup<"fixed" | "flexible">
            aria-label="Tipo de bloco"
            columns={2}
            value={fixed}
            onValueChange={setFixed}
            options={[
              { value: "fixed", label: "Fixo", description: "Nunca é movido" },
              { value: "flexible", label: "Flexível", description: "Pode receber sugestões de ajuste" },
            ]}
          />

          {availableCategory && (
            <Field label="Energia neste horário" htmlFor="block-energy" hint="Deixe em branco para usar a energia do período do dia.">
              <NativeSelect value={energy} onChange={(e) => setEnergy(e.target.value as EnergyLevel | "")}>
                <option value="">Usar energia do período</option>
                {Object.entries(ENERGY_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="danger" onClick={remove} disabled={pending}>
                <Trash2 />
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={days.length === 0}>
                {editing ? "Salvar bloco" : "Adicionar bloco"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
