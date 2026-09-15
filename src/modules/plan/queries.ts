import "server-only";
import type { PlanItemKind, PlanItemStatus, Prisma, SlotClass } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, dbDateToKey, keyToDbDate, localNow, startOfWeek, toDateKey, type DateKey } from "@/lib/time";
import type { Diagnostic } from "@/engines/types";
import { localRange } from "@/modules/performance/metrics";
import { COUNTED_STATUSES } from "./service";

export interface PlanItemView {
  id: string;
  dateKey: DateKey;
  startMinute: number;
  endMinute: number;
  kind: PlanItemKind;
  status: PlanItemStatus;
  timing: "past" | "now" | "future";
  slotClass: SlotClass;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  topicName: string | null;
  parentTopicName: string | null;
  reason: string;
  reasons: { code: string; text: string }[];
  energyScore: number | null;
  accuracy: number | null;
  notes: string | null;
  rescheduledFrom: { dateKey: DateKey; startMinute: number } | null;
}

const itemInclude = {
  subject: { select: { name: true } },
  topic: { select: { name: true, parent: { select: { name: true } } } },
  rescheduledFrom: { select: { date: true, startMinute: true } },
} satisfies Prisma.StudyPlanItemInclude;

type ItemRow = Prisma.StudyPlanItemGetPayload<{ include: typeof itemInclude }>;

export function toItemView(i: ItemRow, today: DateKey, nowMinute: number): PlanItemView {
  const key = dbDateToKey(i.date);
  const timing = key < today || (key === today && i.endMinute <= nowMinute) ? "past" : key === today && i.startMinute <= nowMinute ? "now" : "future";
  const data = (i.reasonData ?? {}) as { reasons?: { code: string; text: string }[]; energyScore?: number; accuracy?: number | null };
  return {
    id: i.id,
    dateKey: key,
    startMinute: i.startMinute,
    endMinute: i.endMinute,
    kind: i.kind,
    status: i.status,
    timing,
    slotClass: i.slotClass,
    subjectId: i.subjectId,
    subjectName: i.subject?.name ?? null,
    topicId: i.topicId,
    topicName: i.topic?.name ?? null,
    parentTopicName: i.topic?.parent?.name ?? null,
    reason: i.reason,
    reasons: data.reasons ?? [],
    energyScore: data.energyScore ?? null,
    accuracy: data.accuracy ?? null,
    notes: i.notes,
    rescheduledFrom: i.rescheduledFrom ? { dateKey: dbDateToKey(i.rescheduledFrom.date), startMinute: i.rescheduledFrom.startMinute } : null,
  };
}

export async function getItemsForDay(userId: string, tz: string, day: DateKey) {
  const local = localNow(tz);
  const rows = await db.studyPlanItem.findMany({
    where: { userId, date: keyToDbDate(day), status: { notIn: ["POSTPONED"] } },
    include: itemInclude,
    orderBy: { startMinute: "asc" },
  });
  return rows.map((r) => toItemView(r, local.key, local.minute));
}

export interface RecommendationView {
  id: string;
  status: string;
  title: string;
  body: string;
  reason: string;
  moves: { itemId: string; label: string; from: { dateKey: string; startMinute: number; endMinute: number }; to: { dateKey: string; startMinute: number; endMinute: number } }[];
  dropped: { itemId: string; label: string }[];
}

export async function getWeekPlanView(userId: string, tz: string, week: "current" | "next" = "current") {
  const local = localNow(tz);
  const weekStart = week === "next" ? addDays(startOfWeek(local.key), 7) : startOfWeek(local.key);
  const weekEnd = addDays(weekStart, 7);

  const plan = await db.studyPlan.findUnique({
    where: { userId_weekStart: { userId, weekStart: keyToDbDate(weekStart) } },
    select: { id: true, version: true, createdAt: true, plannedMinutes: true, recommendedMinutes: true, diagnostics: true, engineVersion: true },
  });

  const [rows, sessions, recs] = await Promise.all([
    db.studyPlanItem.findMany({
      where: { userId, date: { gte: keyToDbDate(weekStart), lt: keyToDbDate(weekEnd) } },
      include: itemInclude,
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    }),
    db.studySession.findMany({
      where: { userId, status: "COMPLETED", startedAt: localRange(weekStart, weekEnd, tz) },
      select: { effectiveSeconds: true, subjectId: true, startedAt: true, subject: { select: { name: true } } },
    }),
    db.aiRecommendation.findMany({
      where: { userId, kind: "REPLAN", createdAt: { gte: localRange(weekStart, weekEnd, tz).gte } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const items = rows.map((r) => toItemView(r, local.key, local.minute));
  const counted = items.filter((i) => COUNTED_STATUSES.includes(i.status));
  const plannedMinutes = counted.reduce((a, i) => a + i.endMinute - i.startMinute, 0);
  const executedMinutes = Math.round(sessions.reduce((a, s) => a + s.effectiveSeconds, 0) / 60);

  // Execution is judged against what was due so far, not the whole week.
  const dueSoFar = (i: PlanItemView) => i.timing === "past" || i.status === "DONE";
  const plannedToDateMinutes = counted.filter(dueSoFar).reduce((a, i) => a + i.endMinute - i.startMinute, 0);

  const subjects = new Map<string, { name: string; planned: number; plannedToDate: number; executed: number }>();
  for (const i of counted) {
    if (!i.subjectId) continue;
    const s = subjects.get(i.subjectId) ?? { name: i.subjectName ?? "", planned: 0, plannedToDate: 0, executed: 0 };
    s.planned += i.endMinute - i.startMinute;
    if (dueSoFar(i)) s.plannedToDate += i.endMinute - i.startMinute;
    subjects.set(i.subjectId, s);
  }
  for (const s of sessions) {
    if (!s.subjectId) continue;
    const entry = subjects.get(s.subjectId) ?? { name: s.subject?.name ?? "", planned: 0, plannedToDate: 0, executed: 0 };
    entry.executed += s.effectiveSeconds / 60;
    subjects.set(s.subjectId, entry);
  }

  const days = Array.from({ length: 7 }, (_, n) => addDays(weekStart, n)).map((key) => ({
    key,
    isToday: key === local.key,
    isPast: key < local.key,
    items: items.filter((i) => i.dateKey === key && i.status !== "POSTPONED"),
    executedMinutes: Math.round(sessions.filter((s) => toDateKey(s.startedAt, tz) === key).reduce((a, s) => a + s.effectiveSeconds / 60, 0)),
  }));

  const toRec = (r: (typeof recs)[number]): RecommendationView => {
    const changes = (r.proposedChanges ?? {}) as { moves?: RecommendationView["moves"]; dropped?: RecommendationView["dropped"] };
    return { id: r.id, status: r.status, title: r.title, body: r.body, reason: r.reason, moves: changes.moves ?? [], dropped: changes.dropped ?? [] };
  };
  const pending = recs.find((r) => r.status === "PENDING");
  const undoable = recs.find((r) => ["ACCEPTED", "EDITED", "AUTO_APPLIED"].includes(r.status));

  const missedOpen = items.filter((i) => i.status === "MISSED" && i.kind !== "FLASHCARDS");
  const rescheduledFromIds = new Set(rows.filter((r) => r.rescheduledFromId).map((r) => r.rescheduledFromId));
  const missedUnhandled = missedOpen.filter((i) => !rescheduledFromIds.has(i.id));

  return {
    weekStart,
    today: local.key,
    nowMinute: local.minute,
    plan: plan
      ? {
          ...plan,
          diagnostics: (plan.diagnostics ?? {}) as { diagnostics?: Diagnostic[]; unplacedMinutes?: number },
        }
      : null,
    days,
    plannedMinutes,
    plannedToDateMinutes,
    executedMinutes,
    bySubject: [...subjects.entries()]
      .map(([id, s]) => ({ id, name: s.name, planned: Math.round(s.planned), plannedToDate: Math.round(s.plannedToDate), executed: Math.round(s.executed) }))
      .sort((a, b) => b.planned - a.planned),
    missedCount: missedUnhandled.length,
    pendingRecommendation: pending ? toRec(pending) : null,
    undoableRecommendation: undoable ? toRec(undoable) : null,
  };
}

/** Leaf topics of the user's active editais, grouped by subject — for session pickers. */
export async function getStudyPickerOptions(userId: string) {
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: "ACTIVE" },
    select: {
      competition: {
        select: {
          topics: {
            select: { topic: { select: { id: true, name: true, parentId: true, subjectId: true, order: true, subject: { select: { name: true } }, parent: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  const all = new Map<string, { id: string; name: string; parentId: string | null; subjectId: string; subjectName: string; parentName: string | null; order: number }>();
  for (const e of enrollments)
    for (const t of e.competition.topics)
      all.set(t.topic.id, { ...t.topic, subjectName: t.topic.subject.name, parentName: t.topic.parent?.name ?? null });
  const parents = new Set([...all.values()].map((t) => t.parentId).filter(Boolean));
  const subjects = new Map<string, { id: string; name: string; topics: { id: string; name: string }[] }>();
  for (const t of [...all.values()].filter((t) => !parents.has(t.id)).sort((a, b) => a.order - b.order)) {
    const s = subjects.get(t.subjectId) ?? { id: t.subjectId, name: t.subjectName, topics: [] };
    s.topics.push({ id: t.id, name: t.parentName ? `${t.parentName} › ${t.name}` : t.name });
    subjects.set(t.subjectId, s);
  }
  return [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
