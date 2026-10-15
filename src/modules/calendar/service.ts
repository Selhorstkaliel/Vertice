import "server-only";
import type { CalendarEventType, PlanItemKind } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, dbDateToKey, keyToDbDate, localNow, minuteOfDay, toDateKey, zonedToUtc, type DateKey } from "@/lib/time";
import { formatPercent, plural } from "@/lib/format";
import { PLAN_ITEM_STATUS_LABEL } from "@/lib/labels";
import { planItemTitle } from "@/modules/plan/titles";
import { competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { formatMeasure } from "@/engines/military/taf";
import { listGoals } from "@/modules/goals/service";
import { formatGoalValue, goalTitle } from "@/modules/goals/format";
import { STAGE_ITEM_KIND_LABEL } from "@/lib/labels";

/*
 * One read model for the calendar (§47). Only custom events are stored as
 * CalendarEvent rows; everything else is derived from where it already lives,
 * so the calendar can never disagree with the plan, the edital or the TAF log.
 */

export interface CalendarItem {
  id: string;
  type: CalendarEventType;
  title: string;
  detail: string | null;
  dateKey: DateKey;
  startMinute: number | null;
  endMinute: number | null;
  href: string | null;
  done: boolean;
  /** Present only for student-created events, which can be edited here. */
  event: { id: string; description: string | null; competitionId: string | null; allDay: boolean } | null;
}

const PLAN_TYPE: Partial<Record<PlanItemKind, CalendarEventType>> = { REVIEW: "REVIEW", FLASHCARDS: "REVIEW", ERROR_NOTEBOOK: "REVIEW", SIMULATION: "SIMULATION" };

function stageType(name: string): CalendarEventType {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (n.includes("taf") || n.includes("fisic")) return "TAF";
  if (n.includes("inscri")) return "REGISTRATION";
  if (n.includes("edital")) return "EDITAL";
  return "EXAM";
}

export async function getCalendarItems(userId: string, tz: string, from: DateKey, to: DateKey): Promise<CalendarItem[]> {
  const today = localNow(tz).key;
  const range = { gte: zonedToUtc(from, 0, tz), lt: zonedToUtc(to, 0, tz) };
  const dateRange = { gte: keyToDbDate(from), lt: keyToDbDate(to) };
  const reviewFrom = from > today ? from : today;

  const [planItems, reviewsDue, overdue, enrollments, stages, attempts, tafResults, events] = await Promise.all([
    db.studyPlanItem.findMany({
      where: { userId, date: dateRange, status: { notIn: ["CANCELED", "POSTPONED"] } },
      select: { id: true, date: true, startMinute: true, endMinute: true, kind: true, status: true, subject: { select: { name: true } }, topic: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    }),
    reviewFrom < to
      ? db.topicProgress.findMany({
          where: { userId, nextReviewAt: { gte: zonedToUtc(reviewFrom, 0, tz), lt: range.lt } },
          select: { nextReviewAt: true, topic: { select: { name: true } } },
          orderBy: { nextReviewAt: "asc" },
        })
      : Promise.resolve([]),
    today >= from && today < to ? db.topicProgress.count({ where: { userId, nextReviewAt: { lt: zonedToUtc(today, 0, tz) } } }) : Promise.resolve(0),
    db.studentCompetition.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      select: { competitionId: true, customExamDate: true, keepCustomExamDate: true, competition: { select: { name: true, year: true, examDate: true, verification: true } } },
    }),
    db.studentStage.findMany({
      where: { enrollment: { userId, status: { not: "ARCHIVED" } }, date: dateRange },
      select: { id: true, name: true, date: true, status: true, enrollment: { select: { customExamDate: true, keepCustomExamDate: true, competition: { select: { id: true, kind: true, name: true, year: true, examDate: true } } } } },
    }),
    db.simulationAttempt.findMany({
      where: { userId, status: { in: ["FINISHED", "EXPIRED"] }, finishedAt: range },
      select: { id: true, finishedAt: true, startedAt: true, score: true, simulation: { select: { title: true } } },
    }),
    db.militaryTestResult.findMany({ where: { userId, recordedAt: dateRange }, select: { id: true, recordedAt: true, value: true, test: { select: { name: true, unit: true } } } }),
    db.calendarEvent.findMany({ where: { userId, startsAt: range }, orderBy: { startsAt: "asc" } }),
  ]);
  const stageItems = await db.studentStageItem.findMany({
    where: { dueDate: dateRange, stage: { enrollment: { userId, status: { not: "ARCHIVED" } } } },
    select: {
      id: true,
      title: true,
      kind: true,
      dueDate: true,
      doneAt: true,
      verification: true,
      dateFromCatalog: true,
      stage: { select: { name: true, enrollment: { select: { competitionId: true, competition: { select: { name: true, kind: true } } } } } },
    },
  });

  const items: CalendarItem[] = [];

  for (const p of planItems) {
    items.push({
      id: `plan:${p.id}`,
      type: PLAN_TYPE[p.kind] ?? "SESSION",
      title: planItemTitle({ kind: p.kind, topicName: p.topic?.name ?? null, subjectName: p.subject?.name ?? null }),
      detail: PLAN_ITEM_STATUS_LABEL[p.status],
      dateKey: dbDateToKey(p.date),
      startMinute: p.startMinute,
      endMinute: p.endMinute,
      href: "/plano",
      done: p.status === "DONE",
      event: null,
    });
  }

  const reviewsByDay = new Map<DateKey, string[]>();
  for (const r of reviewsDue) {
    const key = toDateKey(r.nextReviewAt!, tz);
    reviewsByDay.set(key, [...(reviewsByDay.get(key) ?? []), r.topic.name]);
  }
  for (const [key, names] of reviewsByDay) {
    items.push({
      id: `reviews:${key}`,
      type: "REVIEW",
      title: plural(names.length, "revisão de tópico programada", "revisões de tópicos programadas"),
      detail: names.slice(0, 3).join(", ") + (names.length > 3 ? ` e mais ${names.length - 3}` : ""),
      dateKey: key,
      startMinute: null,
      endMinute: null,
      href: "/edital",
      done: false,
      event: null,
    });
  }
  if (overdue > 0) {
    items.push({ id: `reviews-overdue:${today}`, type: "REVIEW", title: plural(overdue, "revisão atrasada", "revisões atrasadas"), detail: "Programadas para dias anteriores", dateKey: today, startMinute: null, endMinute: null, href: "/edital", done: false, event: null });
  }

  for (const e of enrollments) {
    const exam = effectiveExamDate(e);
    if (!exam.date) continue;
    const key = dbDateToKey(exam.date);
    if (key < from || key >= to) continue;
    items.push({
      id: `exam:${e.competitionId}`,
      type: "EXAM",
      title: `Prova: ${competitionTitle(e.competition, exam.date)}`,
      detail: !exam.official ? "Data informada por você, não oficial" : e.competition.verification === "VERIFIED" ? null : "Informação não verificada",
      dateKey: key,
      startMinute: null,
      endMinute: null,
      href: `/concursos/${e.competitionId}`,
      done: key < today,
      event: null,
    });
  }

  for (const s of stages) {
    const c = s.enrollment.competition;
    items.push({
      id: `stage:${s.id}`,
      type: stageType(s.name),
      title: `${s.name}: ${competitionTitle(c, effectiveExamDate(s.enrollment).date)}`,
      detail: "Data informada por você",
      dateKey: dbDateToKey(s.date!),
      startMinute: null,
      endMinute: null,
      href: c.kind === "MILITARY" ? "/militar" : `/concursos/${c.id}`,
      done: s.status === "PASSED" || s.status === "FAILED" || s.status === "NOT_APPLICABLE",
      event: null,
    });
  }

  for (const i of stageItems) {
    const c = i.stage.enrollment.competition;
    items.push({
      id: `stage-item:${i.id}`,
      type: i.kind === "REGISTRATION_DEADLINE" ? "REGISTRATION" : "CUSTOM",
      title: `Prazo: ${i.title}`,
      detail: `${c.name}, ${i.stage.name} (${STAGE_ITEM_KIND_LABEL[i.kind].toLowerCase()})${i.dateFromCatalog && i.verification !== "VERIFIED" ? ". Informação não verificada" : !i.dateFromCatalog ? ". Data informada por você" : ""}`,
      dateKey: dbDateToKey(i.dueDate!),
      startMinute: null,
      endMinute: null,
      href: c.kind === "MILITARY" ? "/militar" : `/concursos/${i.stage.enrollment.competitionId}`,
      done: !!i.doneAt,
      event: null,
    });
  }

  for (const a of attempts) {
    const start = minuteOfDay(a.startedAt, tz);
    const sameDay = toDateKey(a.startedAt, tz) === toDateKey(a.finishedAt!, tz);
    items.push({
      id: `attempt:${a.id}`,
      type: "SIMULATION",
      title: `Simulado: ${a.simulation.title}`,
      detail: a.score !== null ? `Nota ${formatPercent(a.score)}` : null,
      dateKey: toDateKey(a.finishedAt!, tz),
      startMinute: sameDay ? start : null,
      endMinute: sameDay ? minuteOfDay(a.finishedAt!, tz) : null,
      href: `/simulados/resultado/${a.id}`,
      done: true,
      event: null,
    });
  }

  for (const r of tafResults) {
    items.push({
      id: `taf:${r.id}`,
      type: "TAF",
      title: `TAF: ${r.test.name}`,
      detail: `Resultado ${formatMeasure(r.value, r.test.unit)}`,
      dateKey: dbDateToKey(r.recordedAt),
      startMinute: null,
      endMinute: null,
      href: "/militar?aba=taf",
      done: true,
      event: null,
    });
  }

  // Deadline of each active weekly or monthly goal in its current period.
  for (const g of await listGoals(userId, tz)) {
    if (!g.isActive || g.period === "DAILY") continue;
    const last = addDays(g.range.end, -1);
    if (last < from || last >= to) continue;
    items.push({
      id: `goal:${g.id}`,
      type: "GOAL",
      title: `Fim do período da meta: ${goalTitle(g)}`,
      detail: `${formatGoalValue(g.kind, g.value)} de ${formatGoalValue(g.kind, g.target)} até agora`,
      dateKey: last,
      startMinute: null,
      endMinute: null,
      href: "/metas",
      done: g.status.pace === "DONE",
      event: null,
    });
  }

  for (const e of events) {
    const key = toDateKey(e.startsAt, tz);
    items.push({
      id: `event:${e.id}`,
      type: e.type,
      title: e.title,
      detail: e.description,
      dateKey: key,
      startMinute: e.allDay ? null : minuteOfDay(e.startsAt, tz),
      endMinute: e.allDay || !e.endsAt ? null : minuteOfDay(e.endsAt, tz),
      href: null,
      done: false,
      event: { id: e.id, description: e.description, competitionId: e.competitionId, allDay: e.allDay },
    });
  }

  return items.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : (a.startMinute ?? -1) - (b.startMinute ?? -1)));
}
