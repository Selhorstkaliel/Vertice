import "server-only";
import { db } from "@/lib/db";
import type { EnergyInput, RoutineBlockInput } from "@/engines/types";
import { DEFAULT_ENERGY } from "@/engines/routine/availability";
import { analyzeRoutine } from "@/engines/routine/analyzer";
import { addDays, dbDateToKey, localNow, startOfWeek, toDateKey, type DateKey } from "@/lib/time";

export async function getActiveRoutine(userId: string) {
  return db.routine.findFirst({
    where: { userId, isActive: true },
    include: { blocks: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } },
  });
}

export async function getEnergy(userId: string): Promise<EnergyInput[]> {
  const rows = await db.energyPeriod.findMany({ where: { userId } });
  if (rows.length === 0) return DEFAULT_ENERGY;
  return DEFAULT_ENERGY.map((d) => {
    const row = rows.find((r) => r.period === d.period);
    return row ? { period: row.period, level: row.level, learnedDelta: row.learnedDelta } : d;
  });
}

export function toBlockInput(b: {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  category: RoutineBlockInput["category"];
  isFixed: boolean;
  energy: RoutineBlockInput["energy"];
  label: string | null;
}): RoutineBlockInput {
  return {
    id: b.id,
    dayOfWeek: b.dayOfWeek,
    startMinute: b.startMinute,
    endMinute: b.endMinute,
    category: b.category,
    isFixed: b.isFixed,
    energy: b.energy,
    label: b.label,
  };
}

/**
 * Planned vs executed minutes for the weeks before `weekStart` (most recent first).
 */
export async function getWeekHistory(userId: string, weekStart: DateKey, weeks = 4, tz = "America/Sao_Paulo") {
  const from = addDays(weekStart, -7 * weeks);
  const plans = await db.studyPlan.findMany({
    where: { userId, weekStart: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${weekStart}T00:00:00Z`) } },
    select: { weekStart: true, items: { where: { status: { not: "CANCELED" } }, select: { startMinute: true, endMinute: true } } },
    orderBy: { weekStart: "desc" },
  });
  if (plans.length === 0) return [];

  const sessions = await db.studySession.findMany({
    where: {
      userId,
      status: "COMPLETED",
      startedAt: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${weekStart}T12:00:00Z`) },
    },
    select: { startedAt: true, effectiveSeconds: true },
  });

  return plans.map((p) => {
    const key = dbDateToKey(p.weekStart);
    const executed = sessions
      .filter((s) => startOfWeek(toDateKey(s.startedAt, tz)) === key)
      .reduce((a, s) => a + s.effectiveSeconds / 60, 0);
    return {
      weekStart: key,
      plannedMinutes: p.items.reduce((a, i) => a + i.endMinute - i.startMinute, 0),
      executedMinutes: Math.round(executed),
    };
  });
}

export async function analyzeUserRoutine(
  userId: string,
  profile: { weeklyHoursTarget: number | null; dailyStudyLimitMin: number; maxSessionMin: number; timezone: string },
  weekStart: DateKey,
  plannedMinutes?: number | null,
) {
  const [routine, energy, history] = await Promise.all([
    getActiveRoutine(userId),
    getEnergy(userId),
    // Only finished weeks count as history, even when planning ahead.
    getWeekHistory(userId, [weekStart, startOfWeek(localNow(profile.timezone).key)].sort()[0]!, 4, profile.timezone),
  ]);
  const blocks = (routine?.blocks ?? []).map(toBlockInput);
  const analysis = analyzeRoutine({
    blocks,
    energy,
    weeklyTargetMinutes: profile.weeklyHoursTarget ? Math.round(profile.weeklyHoursTarget * 60) : null,
    dailyLimitMinutes: profile.dailyStudyLimitMin,
    maxSessionMinutes: profile.maxSessionMin,
    history,
    plannedMinutes,
  });
  return { routine, blocks, energy, history, analysis };
}
