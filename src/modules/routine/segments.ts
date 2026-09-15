import type { RoutineCategory } from "@prisma/client";
import { formatClock, weekdayName } from "@/lib/format";
import { ROUTINE_CATEGORY_LABEL } from "@/lib/labels";

export interface DaySegment {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/** Expands a (possibly overnight) block into same-day segments. */
export function blockSegments(days: number[], start: number, end: number): DaySegment[] {
  const out: DaySegment[] = [];
  for (const d of days) {
    if (end > start) out.push({ dayOfWeek: d, startMinute: start, endMinute: end });
    else {
      out.push({ dayOfWeek: d, startMinute: start, endMinute: 1440 });
      if (end > 0) out.push({ dayOfWeek: d === 7 ? 1 : d + 1, startMinute: 0, endMinute: end });
    }
  }
  return out;
}

export function findClash<T extends DaySegment>(existing: T[], segment: DaySegment): T | undefined {
  return existing.find((e) => e.dayOfWeek === segment.dayOfWeek && e.startMinute < segment.endMinute && segment.startMinute < e.endMinute);
}

/** "Faculdade" or "Treino (Academia)"; the label is dropped when it only repeats the category. */
export function blockDisplayName(category: RoutineCategory, label?: string | null) {
  const base = ROUTINE_CATEGORY_LABEL[category];
  return label && label.trim().toLowerCase() !== base.toLowerCase() ? `${base} (${label.trim()})` : base;
}

/** "na segunda", "no sábado" */
export function onWeekday(isoWeekday: number) {
  return `${isoWeekday >= 6 ? "no" : "na"} ${weekdayName(isoWeekday).toLowerCase()}`;
}

export function clashMessage(clash: DaySegment & { category: RoutineCategory; label?: string | null }) {
  return `Conflito ${onWeekday(clash.dayOfWeek)}: já existe “${blockDisplayName(clash.category, clash.label)}” das ${formatClock(clash.startMinute)} às ${formatClock(clash.endMinute)}.`;
}

/** "segunda a sexta", "sábado e domingo", "todos os dias" or a short list. */
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6,7") return "todos os dias";
  if (key === "1,2,3,4,5") return "segunda a sexta";
  if (key === "1,2,3,4,5,6") return "segunda a sábado";
  if (key === "6,7") return "sábado e domingo";
  const names = sorted.map((d) => weekdayName(d).toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
}
