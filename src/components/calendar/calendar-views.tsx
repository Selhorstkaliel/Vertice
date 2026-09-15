import Link from "next/link";
import { CALENDAR_EVENT_TYPE_LABEL } from "@/lib/labels";
import { capitalizeFirst, formatClock, formatDayKey, WEEKDAY_SHORT } from "@/lib/format";
import { addDays, type DateKey } from "@/lib/time";
import type { CalendarItem } from "@/modules/calendar/service";
import { cn } from "@/lib/utils";
import { EventDialog } from "./event-dialog";

type Competition = { id: string; title: string };

/** Rail color groups; the type label is always shown in text next to it. */
const RAIL: Record<CalendarItem["type"], string> = {
  SESSION: "bg-info",
  REVIEW: "bg-fg-muted",
  SIMULATION: "bg-warning",
  EXAM: "bg-warning",
  REGISTRATION: "bg-warning",
  EDITAL: "bg-warning",
  TAF: "bg-warning",
  GOAL: "bg-positive",
  CUSTOM: "bg-fg-faint",
};

export const LEGEND: { label: string; rail: string }[] = [
  { label: "Sessões", rail: RAIL.SESSION },
  { label: "Revisões", rail: RAIL.REVIEW },
  { label: "Provas, prazos, simulados e TAF", rail: RAIL.EXAM },
  { label: "Metas", rail: RAIL.GOAL },
  { label: "Eventos pessoais", rail: RAIL.CUSTOM },
];

function when(item: CalendarItem) {
  if (item.startMinute === null) return "Dia inteiro";
  return item.endMinute !== null ? `${formatClock(item.startMinute)}–${formatClock(item.endMinute)}` : formatClock(item.startMinute);
}

function ItemBody({ item }: { item: CalendarItem }) {
  return (
    <>
      <span aria-hidden="true" className={cn("absolute top-2 bottom-2 left-0 w-0.5 rounded-full", RAIL[item.type])} />
      <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg-subtle">
        <span className="numeral">{when(item)}</span>
        <span>{CALENDAR_EVENT_TYPE_LABEL[item.type]}</span>
        {/* Plan items already carry their status in the detail line. */}
        {item.done && !item.id.startsWith("plan:") && <span>Concluído</span>}
      </span>
      <span className={cn("text-base", item.done ? "text-fg-muted" : "text-fg")}>{item.title}</span>
      {item.detail && <span className="text-sm text-fg-subtle">{item.detail}</span>}
    </>
  );
}

export function AgendaItem({ item, competitions }: { item: CalendarItem; competitions: Competition[] }) {
  const cls = "relative flex w-full flex-col gap-0.5 rounded-[var(--radius-control)] py-2 pr-2 pl-3 text-left transition-colors hover:bg-surface";
  if (item.event) {
    return (
      <EventDialog
        defaultDate={item.dateKey}
        competitions={competitions}
        event={{ id: item.event.id, type: item.type as never, title: item.title, dateKey: item.dateKey, startMinute: item.startMinute, endMinute: item.endMinute, description: item.event.description, competitionId: item.event.competitionId, allDay: item.event.allDay }}
        trigger={
          <button type="button" className={cls} aria-label={`Editar evento ${item.title}`}>
            <ItemBody item={item} />
          </button>
        }
      />
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={cls}>
        <ItemBody item={item} />
      </Link>
    );
  }
  return (
    <div className={cls}>
      <ItemBody item={item} />
    </div>
  );
}

export function DayList({ day, items, today, competitions, heading = true }: { day: DateKey; items: CalendarItem[]; today: DateKey; competitions: Competition[]; heading?: boolean }) {
  return (
    <section aria-label={formatDayKey(day, "long")} className="flex flex-col gap-1">
      {heading && (
        <h3 className={cn("flex items-baseline gap-2 border-b pb-2 text-base font-medium", day === today ? "text-fg" : "text-fg-muted")}>
          <Link href={`/calendario?visao=dia&data=${day}`} className="hover:underline hover:underline-offset-4">
            {capitalizeFirst(formatDayKey(day, "long"))}
          </Link>
          {day === today && <span className="text-sm font-normal text-info">Hoje</span>}
        </h3>
      )}
      {items.length === 0 ? (
        <p className="py-2 text-sm text-fg-subtle">Nada programado.</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((i) => (
            <li key={i.id}>
              <AgendaItem item={i} competitions={competitions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MonthGrid({ month, gridStart, items, today }: { month: string; gridStart: DateKey; items: CalendarItem[]; today: DateKey }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).filter((w, i) => i < 5 || w.some((d) => d.startsWith(month)));
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) byDay.set(i.dateKey, [...(byDay.get(i.dateKey) ?? []), i]);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 border-b pb-2" aria-hidden="true">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d} className="text-center text-sm text-fg-subtle">
            {d}
          </span>
        ))}
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Calendário do mês</caption>
        <thead className="sr-only">
          <tr>
            {WEEKDAY_SHORT.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const list = byDay.get(d) ?? [];
                const inMonth = d.startsWith(month);
                const important = list.filter((i) => i.type !== "SESSION" && i.type !== "REVIEW");
                const shown = [...important, ...list.filter((i) => i.type === "SESSION" || i.type === "REVIEW")].slice(0, 3);
                const label = `${formatDayKey(d, "long")}: ${list.length === 0 ? "nada programado" : `${list.length} ${list.length === 1 ? "item" : "itens"}`}`;
                return (
                  <td key={d} className="h-20 border-b border-line-soft p-0 align-top sm:h-28">
                    <Link href={`/calendario?visao=dia&data=${d}`} aria-label={label} className={cn("flex h-full flex-col gap-1 p-1 transition-colors hover:bg-surface sm:p-1.5", !inMonth && "opacity-45")}>
                      <span
                        className={cn(
                          "numeral inline-flex size-6 items-center justify-center self-start rounded-full text-sm",
                          d === today ? "bg-fg font-medium text-canvas" : "text-fg-muted",
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                      <span className="hidden flex-col gap-0.5 sm:flex">
                        {shown.map((i) => (
                          <span key={i.id} className={cn("relative truncate pl-2 text-xs", i.done ? "text-fg-subtle" : "text-fg-muted")}>
                            <span aria-hidden="true" className={cn("absolute top-0.5 bottom-0.5 left-0 w-0.5 rounded-full", RAIL[i.type])} />
                            {i.startMinute !== null ? `${formatClock(i.startMinute)} ` : ""}
                            {i.title}
                          </span>
                        ))}
                        {list.length > shown.length && <span className="pl-2 text-xs text-fg-subtle">+{list.length - shown.length}</span>}
                      </span>
                      {list.length > 0 && (
                        <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                          {list.slice(0, 4).map((i) => (
                            <span key={i.id} className={cn("size-1.5 rounded-full", RAIL[i.type])} />
                          ))}
                        </span>
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
