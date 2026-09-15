import "server-only";
import type { PlanItemStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { formatMinutes, plural } from "@/lib/format";
import {
  addDays,
  dbDateToKey,
  isoWeekdayOfKey,
  keyToDbDate,
  localNow,
  startOfWeek,
  weekKeys,
  type DateKey,
} from "@/lib/time";
import { subtractIntervals } from "@/engines/routine/availability";
import { rankTopics } from "@/engines/study/priority";
import { buildSchedule, ENGINE_VERSION, type ScheduleDay } from "@/engines/schedule/scheduler";
import type { Diagnostic, PlanItemKind, SlotClass, StudyWindow } from "@/engines/types";
import { loadStudyContext } from "@/modules/study-data/candidates";
import { analyzeUserRoutine } from "@/modules/routine/service";
import { countDueFlashcards } from "@/modules/flashcards/service";

/** Statuses that still occupy time in the plan. */
export const ACTIVE_STATUSES: PlanItemStatus[] = ["PLANNED", "IN_PROGRESS", "DONE"];
/** Statuses that count as "planned" for planned-vs-executed. */
export const COUNTED_STATUSES: PlanItemStatus[] = ["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED", "MISSED"];

const itemMinutes = (i: { startMinute: number; endMinute: number }) => i.endMinute - i.startMinute;

export function cutoffMinute(minute: number) {
  return Math.ceil((minute + 10) / 5) * 5;
}

async function getProfile(userId: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError("Perfil não encontrado. Conclua os primeiros passos.");
  return profile;
}

/** Marks PLANNED items whose time has fully passed as MISSED. Returns how many changed. */
export async function markMissedItems(userId: string, tz: string, now = new Date()) {
  const local = localNow(tz, now);
  const result = await db.studyPlanItem.updateMany({
    where: {
      userId,
      status: "PLANNED",
      OR: [
        { date: { lt: keyToDbDate(local.key) } },
        { date: keyToDbDate(local.key), endMinute: { lte: local.minute } },
      ],
    },
    data: { status: "MISSED" },
  });
  return result.count;
}

export interface GenerateResult {
  planId: string;
  version: number;
  created: number;
  plannedMinutes: number;
  recommendedMinutes: number;
  unplacedMinutes: number;
}

/**
 * Builds (or rebuilds) the current week's plan. Done, in-progress, skipped,
 * canceled and missed items are preserved; only future planned items are
 * replaced. Mid-week rebuilds never push the whole week's load into the
 * remaining days.
 */
export async function generateWeekPlan(
  userId: string,
  opts: { now?: Date; week?: "current" | "next" } = {},
): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const local = localNow(tz, now);
  const currentWeek = startOfWeek(local.key);
  const weekStart = opts.week === "next" ? addDays(currentWeek, 7) : currentWeek;
  const cutoff = cutoffMinute(local.minute);

  await markMissedItems(userId, tz, now);

  const existing = await db.studyPlan.findUnique({
    where: { userId_weekStart: { userId, weekStart: keyToDbDate(weekStart) } },
    include: { items: true },
  });

  const isFuture = (i: { date: Date; startMinute: number }) => {
    const k = dbDateToKey(i.date);
    return k > local.key || (k === local.key && i.startMinute >= cutoff);
  };
  const items = existing?.items ?? [];
  const replaceable = items.filter((i) => (i.status === "PLANNED" || i.status === "POSTPONED") && isFuture(i));
  const replaceableIds = new Set(replaceable.map((i) => i.id));
  const kept = items.filter((i) => !replaceableIds.has(i.id));
  const keptActive = kept.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const keptMinutes = keptActive.reduce((a, i) => a + itemMinutes(i), 0);

  const { analysis } = await analyzeUserRoutine(userId, profile, weekStart);
  const recommended = analysis.recommendedMinutes;

  const remainingDays = weekKeys(weekStart).filter((k) => k >= local.key);
  const windowsFor = (key: DateKey): StudyWindow[] => {
    let ws = analysis.windowsByDay[isoWeekdayOfKey(key) - 1] ?? [];
    if (key === local.key) ws = subtractIntervals(ws, [{ start: 0, end: cutoff }]);
    const occupied = kept
      .filter((i) => dbDateToKey(i.date) === key && ACTIVE_STATUSES.includes(i.status))
      .map((i) => ({ start: i.startMinute, end: i.endMinute }));
    return subtractIntervals(ws, occupied, profile.minBreakMin);
  };

  const days: ScheduleDay[] = remainingDays.map((key) => {
    const dayItems = keptActive.filter((i) => dbDateToKey(i.date) === key);
    return {
      key,
      isoWeekday: isoWeekdayOfKey(key),
      windows: windowsFor(key),
      existingMinutes: dayItems.reduce((a, i) => a + itemMinutes(i), 0),
      hasFlashcards: dayItems.some((i) => i.kind === "FLASHCARDS"),
    };
  });

  let budget = Math.max(0, recommended - keptMinutes);
  if (remainingDays.length < 7 && analysis.capacityMinutes > 0) {
    const remainingCapacity = days.reduce((a, d) => a + d.windows.reduce((s, w) => s + w.end - w.start, 0), 0);
    budget = Math.min(budget, Math.round(((recommended * remainingCapacity) / analysis.capacityMinutes) * 1.1));
  }

  const ctx = await loadStudyContext(userId, tz, local.key);
  const topics = rankTopics(ctx.candidates);
  const [flashTotal, flashDue, unresolvedErrors] = await Promise.all([
    db.flashcard.count({ where: { userId, suspended: false } }),
    countDueFlashcards(userId, tz),
    db.errorEntry.count({ where: { userId, resolvedAt: null } }),
  ]);

  const subjectMinutes: Record<string, number> = {};
  for (const i of keptActive) if (i.subjectId) subjectMinutes[i.subjectId] = (subjectMinutes[i.subjectId] ?? 0) + itemMinutes(i);

  const schedule = buildSchedule({
    days,
    budgetMinutes: budget,
    dailyLimitMinutes: profile.dailyStudyLimitMin,
    maxSessionMinutes: profile.maxSessionMin,
    minBreakMinutes: profile.minBreakMin,
    topics,
    flashcards: { total: flashTotal, dueNow: flashDue },
    unresolvedErrors,
    subjectMinutes,
  });

  const diagnostics: Diagnostic[] = [...analysis.diagnostics, ...schedule.diagnostics];
  const plannedMinutes = keptMinutes + schedule.plannedMinutes;
  const diagnosticsJson = {
    sustainability: analysis.sustainability,
    overloadRisk: analysis.overloadRisk,
    consistency: analysis.consistency,
    capacityMinutes: analysis.capacityMinutes,
    recommendedBasis: analysis.recommendedBasis,
    unplacedMinutes: schedule.unplacedMinutes,
    budgetMinutes: budget,
    diagnostics,
  };

  const plan = await db.$transaction(async (tx) => {
    const p = await tx.studyPlan.upsert({
      where: { userId_weekStart: { userId, weekStart: keyToDbDate(weekStart) } },
      update: {
        version: { increment: 1 },
        status: "ACTIVE",
        engineVersion: ENGINE_VERSION,
        plannedMinutes,
        recommendedMinutes: recommended,
        diagnostics: diagnosticsJson as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId,
        weekStart: keyToDbDate(weekStart),
        engineVersion: ENGINE_VERSION,
        plannedMinutes,
        recommendedMinutes: recommended,
        diagnostics: diagnosticsJson as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, version: true },
    });
    if (replaceable.length) {
      await tx.studyPlanItem.deleteMany({ where: { id: { in: [...replaceableIds] }, userId } });
    }
    if (schedule.items.length) {
      await tx.studyPlanItem.createMany({
        data: schedule.items.map((i) => ({
          planId: p.id,
          userId,
          date: keyToDbDate(i.dateKey),
          startMinute: i.startMinute,
          endMinute: i.endMinute,
          kind: i.kind,
          slotClass: i.slotClass,
          subjectId: i.subjectId,
          topicId: i.topicId,
          competitionId: i.competitionId,
          priorityScore: i.priorityScore,
          reason: i.reason,
          reasonData: i.reasonData as unknown as Prisma.InputJsonValue,
        })),
      });
    }
    return p;
  });

  if (existing) {
    await db.notification
      .create({
        data: {
          userId,
          type: "PLAN_RECALCULATED",
          title: "Seu plano foi recalculado.",
          body: `${plural(schedule.items.length, "sessão planejada", "sessões planejadas")} para o restante da semana (${formatMinutes(plannedMinutes)} no total).`,
          href: "/plano",
          dedupeKey: `plan:${weekStart}:v${plan.version}`,
        },
      })
      .catch(() => undefined);
  }

  return {
    planId: plan.id,
    version: plan.version,
    created: schedule.items.length,
    plannedMinutes,
    recommendedMinutes: recommended,
    unplacedMinutes: schedule.unplacedMinutes,
  };
}

/* ── placement helpers for postpone / redistribute ─────────────────── */

const MIN_CLASS_FOR: Partial<Record<PlanItemKind, SlotClass[]>> = {
  NEW_CONTENT: ["A", "B"],
  QUESTIONS: ["A", "B", "C"],
};

export interface Placement {
  dateKey: DateKey;
  startMinute: number;
  endMinute: number;
  slotClass: SlotClass;
}

/**
 * Finds free slots for items in the remaining days of the current week,
 * spreading them across the days with the most room (never piling onto
 * tomorrow) and respecting the daily limit, breaks and fixed commitments.
 */
export async function findPlacements(
  userId: string,
  requests: { id: string; minutes: number; kind: PlanItemKind }[],
  opts: { now?: Date; excludeDate?: DateKey; weekStart?: DateKey } = {},
) {
  const now = opts.now ?? new Date();
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const local = localNow(tz, now);
  const weekStart = opts.weekStart ?? startOfWeek(local.key);
  const cutoff = cutoffMinute(local.minute);
  const { analysis } = await analyzeUserRoutine(userId, profile, weekStart);

  const activeItems = await db.studyPlanItem.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES }, date: { gte: keyToDbDate(local.key), lte: keyToDbDate(addDays(weekStart, 6)) } },
    select: { date: true, startMinute: true, endMinute: true },
  });

  const state = weekKeys(weekStart)
    .filter((k) => k >= local.key && k !== opts.excludeDate)
    .map((key) => {
      const dayItems = activeItems.filter((i) => dbDateToKey(i.date) === key);
      let windows = analysis.windowsByDay[isoWeekdayOfKey(key) - 1] ?? [];
      if (key === local.key) windows = subtractIntervals(windows, [{ start: 0, end: cutoff }]);
      windows = subtractIntervals(windows, dayItems.map((i) => ({ start: i.startMinute, end: i.endMinute })), profile.minBreakMin);
      return { key, windows, used: dayItems.reduce((a, i) => a + itemMinutes(i), 0) };
    });

  const placements = new Map<string, Placement>();
  for (const req of requests) {
    const allowed = MIN_CLASS_FOR[req.kind];
    const candidates = state
      .map((d) => {
        const room = profile.dailyStudyLimitMin - d.used;
        const window = d.windows.find((w) => w.end - w.start >= req.minutes && (!allowed || allowed.includes(w.slotClass)));
        return { d, room, window };
      })
      .filter((c) => c.window && c.room >= req.minutes)
      .sort((a, b) => b.room - a.room || (a.d.key < b.d.key ? -1 : 1));
    const chosen = candidates[0];
    if (!chosen?.window) continue;
    const start = chosen.window.start;
    const placement = { dateKey: chosen.d.key, startMinute: start, endMinute: start + req.minutes, slotClass: chosen.window.slotClass };
    placements.set(req.id, placement);
    chosen.d.used += req.minutes;
    chosen.d.windows = subtractIntervals(chosen.d.windows, [{ start, end: start + req.minutes }], profile.minBreakMin);
  }
  return { placements, dailyLimit: profile.dailyStudyLimitMin, tz };
}

/** Creates a REPLAN recommendation for missed sessions of the current week. */
export async function proposeRedistribution(userId: string, now = new Date()) {
  const profile = await getProfile(userId);
  await markMissedItems(userId, profile.timezone, now);
  const local = localNow(profile.timezone, now);
  const weekStart = startOfWeek(local.key);

  const missed = await db.studyPlanItem.findMany({
    where: {
      userId,
      status: "MISSED",
      rescheduledTo: null,
      date: { gte: keyToDbDate(weekStart), lte: keyToDbDate(addDays(weekStart, 6)) },
      kind: { notIn: ["FLASHCARDS"] },
    },
    include: { topic: { select: { name: true } }, subject: { select: { name: true } } },
    orderBy: { priorityScore: "desc" },
  });
  if (missed.length === 0) throw new DomainError("Não há sessões não realizadas nesta semana.");

  const { placements, dailyLimit } = await findPlacements(
    userId,
    missed.map((m) => ({ id: m.id, minutes: itemMinutes(m), kind: m.kind })),
    { now },
  );

  const moves = missed
    .filter((m) => placements.has(m.id))
    .map((m) => ({
      itemId: m.id,
      label: m.topic?.name ?? m.subject?.name ?? m.kind,
      from: { dateKey: dbDateToKey(m.date), startMinute: m.startMinute, endMinute: m.endMinute },
      to: placements.get(m.id)!,
    }));
  const dropped = missed.filter((m) => !placements.has(m.id)).map((m) => ({ itemId: m.id, label: m.topic?.name ?? m.subject?.name ?? m.kind }));

  // Replace any pending proposal for this week.
  await db.aiRecommendation.updateMany({ where: { userId, kind: "REPLAN", status: "PENDING" }, data: { status: "IGNORED", decidedAt: now } });

  const reason =
    `${plural(missed.length, "sessão não realizada", "sessões não realizadas")} nesta semana. ` +
    `As sessões foram distribuídas pelos dias com mais espaço livre, sem ultrapassar seu limite diário de ${formatMinutes(dailyLimit)} ` +
    "e sem ocupar sono ou compromissos fixos." +
    (dropped.length ? ` ${plural(dropped.length, "sessão ficou", "sessões ficaram")} sem espaço e foram deixadas de fora pela menor prioridade.` : "");

  const rec = await db.aiRecommendation.create({
    data: {
      userId,
      kind: "REPLAN",
      source: "ENGINE",
      title: moves.length ? `Redistribuir ${plural(moves.length, "sessão", "sessões")}` : "Sem espaço para redistribuir",
      body: moves.length ? "Novos horários propostos para as sessões não realizadas." : "Não há horários livres suficientes nesta semana.",
      reason,
      evidence: { missed: missed.length, weekStart, dailyLimit } as Prisma.InputJsonValue,
      proposedChanges: { moves, dropped } as unknown as Prisma.InputJsonValue,
    },
  });

  if (profile.autoApplyMinorChanges && moves.length > 0 && moves.length <= 2 && dropped.length === 0) {
    await applyRecommendation(userId, rec.id, null, "AUTO_APPLIED");
  }
  return rec.id;
}

type Move = { itemId: string; to: Placement };

export async function applyRecommendation(
  userId: string,
  recommendationId: string,
  selectedItemIds: string[] | null,
  status: "ACCEPTED" | "EDITED" | "AUTO_APPLIED",
) {
  const rec = await db.aiRecommendation.findFirst({ where: { id: recommendationId, userId, status: "PENDING" } });
  if (!rec) throw new DomainError("Recomendação não encontrada ou já decidida.");
  const changes = rec.proposedChanges as { moves?: Move[] };
  const moves = (changes.moves ?? []).filter((m) => !selectedItemIds || selectedItemIds.includes(m.itemId));
  if (moves.length === 0) throw new DomainError("Selecione pelo menos uma sessão.");

  const created = await db.$transaction(async (tx) => {
    const originals = await tx.studyPlanItem.findMany({ where: { id: { in: moves.map((m) => m.itemId) }, userId, rescheduledTo: null } });
    const ids: string[] = [];
    for (const m of moves) {
      const o = originals.find((x) => x.id === m.itemId);
      if (!o) continue;
      const clash = await tx.studyPlanItem.findFirst({
        where: {
          userId,
          date: keyToDbDate(m.to.dateKey),
          status: { in: ACTIVE_STATUSES },
          startMinute: { lt: m.to.endMinute },
          endMinute: { gt: m.to.startMinute },
        },
        select: { id: true },
      });
      if (clash) continue;
      const item = await tx.studyPlanItem.create({
        data: {
          planId: o.planId,
          userId,
          date: keyToDbDate(m.to.dateKey),
          startMinute: m.to.startMinute,
          endMinute: m.to.endMinute,
          kind: o.kind,
          slotClass: m.to.slotClass,
          subjectId: o.subjectId,
          topicId: o.topicId,
          competitionId: o.competitionId,
          priorityScore: o.priorityScore,
          reason: `Reagendada da sessão não realizada de ${dbDateToKey(o.date).split("-").reverse().slice(0, 2).join("/")}. ${o.reason}`,
          reasonData: o.reasonData as Prisma.InputJsonValue,
          rescheduledFromId: o.id,
        },
        select: { id: true },
      });
      ids.push(item.id);
    }
    await tx.aiRecommendation.update({
      where: { id: rec.id },
      data: { status, decidedAt: new Date(), previousState: { createdItemIds: ids } as Prisma.InputJsonValue },
    });
    return ids;
  });

  if (status === "AUTO_APPLIED") {
    await db.notification
      .create({
        data: {
          userId,
          type: "PLAN_RECALCULATED",
          title: "Sessões reagendadas automaticamente.",
          body: `${plural(created.length, "sessão não realizada foi reagendada", "sessões não realizadas foram reagendadas")}. Você pode desfazer no Plano.`,
          href: "/plano",
          dedupeKey: `auto:${rec.id}`,
        },
      })
      .catch(() => undefined);
  }
  return created.length;
}

export async function undoRecommendation(userId: string, recommendationId: string) {
  const rec = await db.aiRecommendation.findFirst({
    where: { id: recommendationId, userId, status: { in: ["ACCEPTED", "EDITED", "AUTO_APPLIED"] } },
  });
  if (!rec) throw new DomainError("Nada para desfazer.");
  const prev = (rec.previousState ?? {}) as { createdItemIds?: string[] };
  await db.$transaction([
    db.studyPlanItem.deleteMany({ where: { id: { in: prev.createdItemIds ?? [] }, userId, status: "PLANNED" } }),
    db.aiRecommendation.update({ where: { id: rec.id }, data: { status: "UNDONE", undoneAt: new Date() } }),
  ]);
}
