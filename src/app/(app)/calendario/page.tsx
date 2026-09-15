import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { DayList, LEGEND, MonthGrid } from "@/components/calendar/calendar-views";
import { EventDialog } from "@/components/calendar/event-dialog";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getCalendarItems } from "@/modules/calendar/service";
import { competitionTitle, effectiveExamDate, getEnrollments } from "@/modules/competitions/queries";
import { capitalizeFirst, formatDayKey, formatWeekRange } from "@/lib/format";
import { addDays, isDateKey, localNow, startOfWeek, weekKeys } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendário" };

type View = "mes" | "semana" | "dia";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ visao?: string; data?: string }> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const tz = user.profile.timezone;
  const today = localNow(tz).key;
  const view: View = params.visao === "semana" || params.visao === "dia" ? params.visao : "mes";
  const anchor = params.data && isDateKey(params.data) && params.data >= "2000-01-01" && params.data <= "2100-12-31" ? params.data : today;

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const range =
    view === "dia"
      ? { from: anchor, to: addDays(anchor, 1) }
      : view === "semana"
        ? { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 7) }
        : { from: startOfWeek(monthStart), to: addDays(startOfWeek(monthStart), 42) };

  const [items, enrollments] = await Promise.all([getCalendarItems(user.id, tz, range.from, range.to), getEnrollments(user.id)]);
  const competitions = enrollments.map((e) => ({ id: e.competitionId, title: competitionTitle(e.competition, effectiveExamDate(e).date) }));

  const prev = view === "dia" ? addDays(anchor, -1) : view === "semana" ? addDays(anchor, -7) : shiftMonth(anchor, -1);
  const next = view === "dia" ? addDays(anchor, 1) : view === "semana" ? addDays(anchor, 7) : shiftMonth(anchor, 1);
  const heading =
    view === "dia"
      ? capitalizeFirst(formatDayKey(anchor, "long"))
      : view === "semana"
        ? capitalizeFirst(formatWeekRange(startOfWeek(anchor)))
        : `${capitalizeFirst(MONTHS[Number(anchor.slice(5, 7)) - 1]!)} de ${anchor.slice(0, 4)}`;
  const link = (v: View, d: string) => `/calendario?visao=${v}&data=${d}`;
  const upcoming = view === "mes" ? items.filter((i) => i.dateKey >= today && i.type !== "SESSION" && i.type !== "REVIEW" && i.dateKey.startsWith(anchor.slice(0, 7))).slice(0, 8) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendário" description="Sessões, revisões, provas, etapas, simulados, TAF, metas e seus eventos em um só lugar." actions={<EventDialog defaultDate={anchor < today ? today : anchor} competitions={competitions} />} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost" aria-label={view === "semana" ? "Semana anterior" : view === "mes" ? "Mês anterior" : "Dia anterior"}>
            <Link href={link(view, prev)}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild size="icon" variant="ghost" aria-label={view === "semana" ? "Próxima semana" : view === "mes" ? "Próximo mês" : "Próximo dia"}>
            <Link href={link(view, next)}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="text-lg font-semibold tracking-[-0.01em]" aria-live="polite">
            {heading}
          </h2>
          {!(anchor === today || (view === "mes" && anchor.slice(0, 7) === today.slice(0, 7)) || (view === "semana" && startOfWeek(anchor) === startOfWeek(today))) && (
            <Button asChild size="sm" variant="secondary">
              <Link href={link(view, today)}>Hoje</Link>
            </Button>
          )}
        </div>
        <nav aria-label="Visualização" className="inline-flex rounded-[var(--radius-control)] bg-canvas-2 p-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={link(v, anchor)}
              aria-current={view === v ? "page" : undefined}
              className={cn("flex h-7 items-center rounded-[5px] px-3 text-sm font-medium transition-colors", view === v ? "bg-elevated text-fg" : "text-fg-subtle hover:text-fg")}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5" aria-label="Legenda">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-2 text-sm text-fg-subtle">
            <span aria-hidden="true" className={cn("h-3 w-0.5 rounded-full", l.rail)} />
            {l.label}
          </li>
        ))}
      </ul>

      {view === "mes" && (
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
          <MonthGrid month={anchor.slice(0, 7)} gridStart={range.from} items={items} today={today} />
          <section aria-labelledby="upcoming" className="flex flex-col gap-2">
            <h2 id="upcoming" className="text-md font-semibold">
              Próximas datas importantes
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-fg-subtle">Nenhuma prova, prazo, simulado, TAF ou evento a partir de hoje neste mês.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((i) => (
                  <li key={i.id} className="flex flex-col gap-0.5 border-b border-line-soft pb-2 last:border-b-0">
                    <Link href={link("dia", i.dateKey)} className="text-sm text-fg-subtle hover:text-fg">
                      {capitalizeFirst(formatDayKey(i.dateKey, "long"))}
                    </Link>
                    <span className="text-base text-fg">{i.title}</span>
                    {i.detail && <span className="text-sm text-fg-subtle">{i.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {view === "semana" && (
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {weekKeys(range.from).map((d) => (
            <DayList key={d} day={d} items={items.filter((i) => i.dateKey === d)} today={today} competitions={competitions} />
          ))}
        </div>
      )}

      {view === "dia" && (
        <div className="max-w-2xl">
          <DayList day={anchor} items={items} today={today} competitions={competitions} heading={false} />
        </div>
      )}
    </div>
  );
}
