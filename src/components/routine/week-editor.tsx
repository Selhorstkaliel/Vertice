"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Label, NativeSelect } from "@/components/ui/input";
import { formatClock, formatMinutes, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/format";
import { ROUTINE_CATEGORY_LABEL, SLOT_CLASS_LABEL } from "@/lib/labels";
import type { RoutineCategory, SlotClass, StudyWindow } from "@/engines/types";
import { copyDayAction } from "@/modules/routine/actions";
import { cn } from "@/lib/utils";
import { BlockDialog, type EditableBlock } from "./block-dialog";

const SCALE = 0.62; // px per minute
const HOUR_MARKS = Array.from({ length: 13 }, (_, i) => i * 2);

const OBLIGATION: ReadonlySet<RoutineCategory> = new Set(["WORK", "COLLEGE", "SCHOOL", "COURSE"]);

function blockStyle(category: RoutineCategory) {
  if (category === "STUDY") return "bg-info/14 text-fg shadow-[inset_2px_0_0_var(--info)]";
  if (category === "FREE") return "bg-transparent text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,var(--line)_60%,transparent)_6px_7px)]";
  if (category === "SLEEP") return "bg-canvas-2 text-fg-subtle shadow-[inset_0_0_0_1px_var(--line-soft)]";
  if (OBLIGATION.has(category)) return "bg-elevated text-fg shadow-[inset_2px_0_0_var(--fg-faint)]";
  return "bg-surface text-fg-muted";
}

const WINDOW_TONE: Record<SlotClass, string> = {
  A: "bg-performance",
  B: "bg-info",
  C: "bg-fg-faint",
};

export function WeekEditor({ blocks, windowsByDay }: { blocks: EditableBlock[]; windowsByDay: StudyWindow[][] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EditableBlock | null>(null);
  const [showWindows, setShowWindows] = React.useState(true);
  const [mobileDay, setMobileDay] = React.useState(() => {
    const js = new Date().getDay();
    return String(js === 0 ? 7 : js);
  });
  const [copyOpen, setCopyOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 6 * 60 * SCALE - 8;
  }, []);

  const openNew = (dayOfWeek: number, startMinute = 8 * 60) => {
    const start = Math.min(1380, Math.floor(startMinute / 30) * 30);
    setEditing({ dayOfWeek, startMinute: start, endMinute: Math.min(1440, start + 60), category: "WORK", label: null, isFixed: true, energy: null });
    setDialogOpen(true);
  };
  const openEdit = (b: EditableBlock) => {
    setEditing(b);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Switch id="show-windows" checked={showWindows} onCheckedChange={setShowWindows} />
          <Label htmlFor="show-windows" className="text-base text-fg">
            Mostrar janelas de estudo
          </Label>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
            <Copy />
            Copiar dia
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openNew(Number(mobileDay))}>
            <Plus />
            Adicionar bloco
          </Button>
        </div>
      </div>

      {showWindows && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg-muted" aria-label="Legenda das janelas">
          {(["A", "B", "C"] as SlotClass[]).map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className={cn("h-3 w-1 rounded-full", WINDOW_TONE[c])} aria-hidden="true" />
              {c} — {SLOT_CLASS_LABEL[c]}
            </li>
          ))}
        </ul>
      )}

      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-[var(--radius-object)] shadow-[inset_0_0_0_1px_var(--line)] md:block">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b bg-canvas-2">
          <span />
          {WEEKDAY_SHORT.map((d, i) => (
            <div key={d} className="flex items-center justify-between border-l px-2.5 py-2">
              <span className="text-sm font-medium text-fg">{d}</span>
              <button
                type="button"
                onClick={() => openNew(i + 1)}
                className="rounded p-0.5 text-fg-subtle hover:bg-surface hover:text-fg"
                aria-label={`Adicionar bloco em ${WEEKDAY_NAMES[i]}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div ref={scrollRef} className="scrollbar-thin relative max-h-[68vh] overflow-y-auto">
          <div className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height: 1440 * SCALE }}>
            <div className="relative">
              {HOUR_MARKS.map((h) => (
                <span key={h} className="numeral absolute right-2 -translate-y-1/2 text-2xs text-fg-subtle" style={{ top: h * 60 * SCALE }}>
                  {h > 0 && h < 24 ? `${String(h).padStart(2, "0")}:00` : ""}
                </span>
              ))}
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div
                key={day}
                className="relative border-l"
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  openNew(day, (e.clientY - rect.top) / SCALE);
                }}
              >
                {HOUR_MARKS.map((h) => (
                  <span key={h} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-line-soft" style={{ top: h * 60 * SCALE }} />
                ))}
                {showWindows &&
                  (windowsByDay[day - 1] ?? []).map((w) => (
                    <span
                      key={`${w.start}-${w.end}`}
                      title={`${SLOT_CLASS_LABEL[w.slotClass]} — ${formatClock(w.start)}–${formatClock(w.end)} (${formatMinutes(w.end - w.start)})`}
                      className={cn("pointer-events-none absolute right-0.5 w-[3px] rounded-full opacity-80", WINDOW_TONE[w.slotClass])}
                      style={{ top: w.start * SCALE + 1, height: Math.max(4, (w.end - w.start) * SCALE - 2) }}
                    />
                  ))}
                {blocks
                  .filter((b) => b.dayOfWeek === day)
                  .map((b) => {
                    const height = (b.endMinute - b.startMinute) * SCALE;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openEdit(b)}
                        className={cn(
                          "absolute right-2 left-1 flex flex-col justify-start overflow-hidden rounded-[5px] px-1.5 text-left transition-[filter] hover:brightness-110 focus-visible:z-10",
                          blockStyle(b.category),
                        )}
                        style={{ top: b.startMinute * SCALE + 1, height: Math.max(14, height - 2) }}
                        aria-label={`${ROUTINE_CATEGORY_LABEL[b.category]}${b.label ? `, ${b.label}` : ""}, ${WEEKDAY_NAMES[day - 1]} das ${formatClock(b.startMinute)} às ${formatClock(b.endMinute)}${b.isFixed ? ", fixo" : ", flexível"}`}
                      >
                        <span className="block truncate pt-0.5 text-2xs leading-4 font-medium">{b.label || ROUTINE_CATEGORY_LABEL[b.category]}</span>
                        {height >= 30 && (
                          <span className="numeral block truncate text-2xs leading-4 opacity-75">
                            {formatClock(b.startMinute)}–{formatClock(b.endMinute)}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: one day at a time */}
      <div className="flex flex-col gap-3 md:hidden">
        <Segmented
          aria-label="Dia da semana"
          value={mobileDay}
          onValueChange={setMobileDay}
          options={WEEKDAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d.slice(0, 1) + d.slice(1, 3) }))}
          className="w-full [&>button]:flex-1 [&>button]:px-0"
        />
        <MobileDayList
          day={Number(mobileDay)}
          blocks={blocks.filter((b) => b.dayOfWeek === Number(mobileDay))}
          windows={showWindows ? (windowsByDay[Number(mobileDay) - 1] ?? []) : []}
          onEdit={openEdit}
          onAdd={() => openNew(Number(mobileDay))}
        />
      </div>

      <BlockDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
      <CopyDayDialog open={copyOpen} onOpenChange={setCopyOpen} />
    </div>
  );
}

function MobileDayList({
  day,
  blocks,
  windows,
  onEdit,
  onAdd,
}: {
  day: number;
  blocks: EditableBlock[];
  windows: StudyWindow[];
  onEdit: (b: EditableBlock) => void;
  onAdd: () => void;
}) {
  const rows = [
    ...blocks.map((b) => ({ type: "block" as const, start: b.startMinute, block: b })),
    ...windows.map((w) => ({ type: "window" as const, start: w.start, window: w })),
  ].sort((a, b) => a.start - b.start);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-base text-fg-muted">Nenhum bloco em {WEEKDAY_NAMES[day - 1]?.toLowerCase()}.</p>
        <Button size="sm" onClick={onAdd}>
          <Plus />
          Adicionar bloco
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {rows.map((r) =>
        r.type === "block" ? (
          <li key={`b-${r.block.id}`}>
            <button type="button" onClick={() => onEdit(r.block)} className="flex w-full items-center gap-4 border-b border-line-soft py-3 text-left">
              <span className="numeral w-24 shrink-0 text-sm text-fg-muted">
                {formatClock(r.block.startMinute)}–{formatClock(r.block.endMinute)}
              </span>
              <span className="flex-1 truncate text-base text-fg">{r.block.label || ROUTINE_CATEGORY_LABEL[r.block.category]}</span>
              <span className="text-sm text-fg-subtle">{r.block.isFixed ? "Fixo" : "Flexível"}</span>
            </button>
          </li>
        ) : (
          <li key={`w-${r.window.start}`} className="flex items-center gap-4 border-b border-line-soft py-2.5">
            <span className="numeral w-24 shrink-0 text-sm text-fg-subtle">
              {formatClock(r.window.start)}–{formatClock(r.window.end)}
            </span>
            <span className={cn("h-3 w-1 rounded-full", WINDOW_TONE[r.window.slotClass])} aria-hidden="true" />
            <span className="text-sm text-fg-subtle">Janela {r.window.slotClass} — {SLOT_CLASS_LABEL[r.window.slotClass].toLowerCase()}</span>
          </li>
        ),
      )}
    </ul>
  );
}

function CopyDayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [from, setFrom] = React.useState("1");
  const [to, setTo] = React.useState<number[]>([]);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Copiar dia" description="Os blocos dos dias de destino serão substituídos.">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="copy-from">Copiar de</Label>
            <NativeSelect id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg-muted">Para</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((d, i) => {
                const day = i + 1;
                const disabled = String(day) === from;
                const on = to.includes(day) && !disabled;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => setTo((list) => (on ? list.filter((x) => x !== day) : [...list, day]))}
                    className={cn(
                      "h-9 w-12 rounded-[var(--radius-control)] text-sm font-medium transition-colors disabled:opacity-30",
                      on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={to.filter((d) => String(d) !== from).length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await copyDayAction(Number(from), to);
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success(result.message);
                    onOpenChange(false);
                    setTo([]);
                  }
                })
              }
            >
              Copiar blocos
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
