import { addDays, diffDays, startOfWeek, type DateKey } from "@/lib/time";

/** Goals (§49): period bounds and pace, measured only from recorded activity. */

export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

export interface PeriodRange {
  start: DateKey;
  /** Exclusive. */
  end: DateKey;
}

export function periodRange(period: GoalPeriod, day: DateKey): PeriodRange {
  if (period === "DAILY") return { start: day, end: addDays(day, 1) };
  if (period === "WEEKLY") {
    const start = startOfWeek(day);
    return { start, end: addDays(start, 7) };
  }
  const [y, m] = day.split("-").map(Number) as [number, number];
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end: next };
}

export function previousPeriod(period: GoalPeriod, range: PeriodRange): PeriodRange {
  return periodRange(period, addDays(range.start, -1));
}

export type GoalPace = "DONE" | "ON_TRACK" | "BEHIND" | "NOT_STARTED";

export interface GoalStatus {
  ratio: number;
  /** Share of the period already elapsed, counting today as fully elapsed. */
  elapsed: number;
  pace: GoalPace;
  remaining: number;
  daysLeft: number;
}

export function goalStatus(value: number, target: number, range: PeriodRange, today: DateKey): GoalStatus {
  const total = diffDays(range.start, range.end);
  const daysElapsed = Math.min(total, Math.max(0, diffDays(range.start, today) + 1));
  const elapsed = total > 0 ? daysElapsed / total : 1;
  const ratio = target > 0 ? value / target : 0;
  const pace: GoalPace = ratio >= 1 ? "DONE" : value === 0 ? "NOT_STARTED" : ratio + 1e-9 >= elapsed * 0.9 ? "ON_TRACK" : "BEHIND";
  return { ratio, elapsed, pace, remaining: Math.max(0, target - value), daysLeft: Math.max(0, total - daysElapsed) };
}
