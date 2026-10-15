import { diffDays, addDays, type DateKey } from "@/lib/time";
import type { BetterWhen, MeasureUnit } from "./taf";

/**
 * Conservative weekly TAF progression (pure). A general suggestion, never a
 * prescription: the screen always says it does not replace a physical
 * education professional or a doctor.
 *
 * Hypotheses (adjustable, not science handed down):
 * - Weekly gain is capped: +8% of the current mark (at least +1) for
 *   repetitions, −1.5% of the time for timed events, +3% for distance and
 *   +2.5% for loads.
 * - Every 4th week is a relief week: no new goal, lower volume.
 * - A re-test every 3 weeks recalibrates the plan from the real mark.
 * - The last week before the test is a taper: hold, rest, no new goal.
 * If the time left is too short to reach the target at that pace, the plan
 * says so plainly instead of compressing into an aggressive progression.
 */

export const DELOAD_EVERY = 4;
export const REASSESS_EVERY = 3;
export const MAX_WEEKS = 52;

const WEEKLY_GAIN: Record<MeasureUnit, { rate: number; minStep: number }> = {
  REPS: { rate: 0.08, minStep: 1 },
  SECONDS: { rate: 0.015, minStep: 1 },
  METERS: { rate: 0.03, minStep: 10 },
  KILOGRAMS: { rate: 0.025, minStep: 0.5 },
};

export type WeekKind = "BUILD" | "DELOAD" | "TAPER";

export interface ProgressionWeek {
  index: number;
  weekStart: DateKey;
  kind: WeekKind;
  /** Mark to aim for at the end of the week (unchanged on relief and taper weeks). */
  goal: number;
  reassess: boolean;
}

export interface ProgressionInput {
  unit: MeasureUnit;
  betterWhen: BetterWhen;
  current: number | null;
  target: number | null;
  today: DateKey;
  testDate: DateKey | null;
}

export type ProgressionStatus = "NEED_BASELINE" | "NEED_TARGET" | "TARGET_MET" | "NEED_DATE" | "TEST_PASSED" | "ON_TRACK" | "TOO_SHORT";

export interface ProgressionResult {
  status: ProgressionStatus;
  weeks: ProgressionWeek[];
  weeksLeft: number | null;
  /** Build weeks the safe pace needs to reach the target from the current mark. */
  buildWeeksNeeded: number | null;
  /** Best mark the safe pace reaches by the test date. */
  projected: number | null;
}

const roundFor = (unit: MeasureUnit, v: number) => (unit === "KILOGRAMS" ? Math.round(v * 2) / 2 : unit === "METERS" ? Math.round(v / 10) * 10 : Math.round(v));

/** One safe step from `value` toward better. */
function step(unit: MeasureUnit, betterWhen: BetterWhen, value: number) {
  const g = WEEKLY_GAIN[unit];
  const delta = Math.max(g.minStep, Math.abs(value) * g.rate);
  return betterWhen === "LOWER" ? value - delta : value + delta;
}

const reached = (betterWhen: BetterWhen, value: number, target: number) => (betterWhen === "LOWER" ? value <= target : value >= target);

/** Week kinds over `n` weeks: relief every DELOAD_EVERY-th week, taper on the last. */
function weekKinds(n: number): WeekKind[] {
  return Array.from({ length: n }, (_, i) => (n >= 2 && i === n - 1 ? "TAPER" : (i + 1) % DELOAD_EVERY === 0 ? "DELOAD" : "BUILD"));
}

export function planTafProgression(input: ProgressionInput): ProgressionResult {
  const empty = { weeks: [], weeksLeft: null, buildWeeksNeeded: null, projected: null };
  const { unit, betterWhen, current, target, today, testDate } = input;
  if (current === null) return { status: "NEED_BASELINE", ...empty };
  if (target === null) return { status: "NEED_TARGET", ...empty };
  if (reached(betterWhen, current, target)) return { status: "TARGET_MET", ...empty, projected: current };

  let needed = 0;
  for (let v = current; !reached(betterWhen, v, target) && needed < MAX_WEEKS * 2; needed++) v = step(unit, betterWhen, v);

  if (!testDate) return { status: "NEED_DATE", ...empty, buildWeeksNeeded: needed };
  const days = diffDays(today, testDate);
  if (days < 0) return { status: "TEST_PASSED", ...empty, buildWeeksNeeded: needed };

  const weeksLeft = Math.min(MAX_WEEKS, Math.floor(days / 7));
  const kinds = weekKinds(weeksLeft);
  const buildWeeks = kinds.filter((k) => k === "BUILD").length;

  // Safe-pace ceiling by the test date.
  let projected = current;
  for (let i = 0; i < buildWeeks; i++) projected = step(unit, betterWhen, projected);
  const feasible = reached(betterWhen, projected, target);

  // Feasible: spread the gap evenly over the build weeks (gentler than the cap).
  // Not feasible: the safe pace, and the plan ends short of the target.
  const evenStep = feasible && buildWeeks > 0 ? (target - current) / buildWeeks : 0;
  let goal = current;
  const weeks: ProgressionWeek[] = kinds.map((kind, index) => {
    if (kind === "BUILD") {
      const safe = step(unit, betterWhen, goal);
      const next = feasible ? goal + evenStep : safe;
      // Never faster than the safe step, never past the target.
      goal = betterWhen === "LOWER" ? Math.max(target, Math.max(next, safe)) : Math.min(target, Math.min(next, safe));
    }
    return {
      index: index + 1,
      weekStart: addDays(today, index * 7),
      kind,
      goal: roundFor(unit, goal),
      reassess: (index + 1) % REASSESS_EVERY === 0 && kind !== "TAPER",
    };
  });

  return {
    status: feasible ? "ON_TRACK" : "TOO_SHORT",
    weeks,
    weeksLeft,
    buildWeeksNeeded: needed,
    projected: roundFor(unit, projected),
  };
}
