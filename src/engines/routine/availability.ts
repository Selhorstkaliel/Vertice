import { DAY_PERIODS, dayPeriodOf } from "@/lib/time";
import type {
  EnergyInput,
  EnergyLevel,
  RoutineBlockInput,
  RoutineCategory,
  SlotClass,
  StudyWindow,
} from "../types";

/** Activities that consume the day's energy budget. */
export const MANDATORY_CATEGORIES: ReadonlySet<RoutineCategory> = new Set([
  "WORK",
  "COLLEGE",
  "SCHOOL",
  "COURSE",
  "COMMUTE",
  "TRAINING",
]);

/** Categories whose time can hold study sessions. */
export const AVAILABLE_CATEGORIES: ReadonlySet<RoutineCategory> = new Set(["STUDY", "FREE"]);

/**
 * Time not covered by any block is treated as available only inside this
 * waking window, so an incomplete routine never schedules study at 3 a.m.
 */
export const WAKING_START = 6 * 60;
export const WAKING_END = 23 * 60 + 30;

export const MIN_WINDOW_MINUTES = 15;

export const ENERGY_SCORE: Record<EnergyLevel, number> = {
  VERY_HIGH: 2,
  HIGH: 1,
  NORMAL: 0,
  LOW: -1,
  VERY_LOW: -2,
};

export const DEFAULT_ENERGY: EnergyInput[] = [
  { period: "DAWN", level: "LOW", learnedDelta: 0 },
  { period: "MORNING", level: "HIGH", learnedDelta: 0 },
  { period: "AFTERNOON", level: "NORMAL", learnedDelta: 0 },
  { period: "EVENING", level: "NORMAL", learnedDelta: 0 },
];

export function classify(score: number, lengthMinutes: number): SlotClass {
  if (lengthMinutes < 25) return "C";
  if (score >= 1) return "A";
  if (score >= -0.5) return "B";
  return "C";
}

/** Fatigue from mandatory load earlier in the day, and late hours. */
export function fatiguePenalty(mandatoryBefore: number, startMinute: number): number {
  let penalty = 0;
  if (mandatoryBefore >= 540) penalty += 1.5;
  else if (mandatoryBefore >= 360) penalty += 0.75;
  if (startMinute >= 22 * 60 + 30) penalty += 0.5;
  return penalty;
}

function mandatoryMinutesBefore(blocks: RoutineBlockInput[], minute: number) {
  let total = 0;
  for (const b of blocks) {
    if (!MANDATORY_CATEGORIES.has(b.category)) continue;
    total += Math.max(0, Math.min(b.endMinute, minute) - b.startMinute);
  }
  return total;
}

/**
 * Builds the classified study windows of a single weekday.
 * Windows are split at day-period boundaries so each has a single energy level.
 */
export function windowsForDay(
  dayOfWeek: number,
  allBlocks: RoutineBlockInput[],
  energy: EnergyInput[] = DEFAULT_ENERGY,
): StudyWindow[] {
  const blocks = allBlocks.filter((b) => b.dayOfWeek === dayOfWeek);
  // availability per minute: 0 blocked, 1 available (implicit), 2 explicit
  const avail = new Uint8Array(1440);
  const blockEnergy = new Array<EnergyLevel | null>(1440).fill(null);

  for (let m = WAKING_START; m < WAKING_END; m++) avail[m] = 1;
  // Blocking categories first, then explicit availability overrides them.
  for (const b of blocks) {
    if (AVAILABLE_CATEGORIES.has(b.category)) continue;
    for (let m = b.startMinute; m < b.endMinute; m++) avail[m] = 0;
  }
  for (const b of blocks) {
    if (!AVAILABLE_CATEGORIES.has(b.category)) continue;
    for (let m = b.startMinute; m < b.endMinute; m++) {
      avail[m] = 2;
      blockEnergy[m] = b.energy;
    }
  }

  const levelByPeriod = new Map(energy.map((e) => [e.period, e]));
  const windows: StudyWindow[] = [];
  const boundaries = new Set(DAY_PERIODS.map((p) => p.start));

  let m = 0;
  while (m < 1440) {
    if (avail[m] === 0) {
      m++;
      continue;
    }
    const start = m;
    const period = dayPeriodOf(start);
    const explicitEnergy = blockEnergy[start];
    let explicit = false;
    while (
      m < 1440 &&
      avail[m] !== 0 &&
      (m === start || !boundaries.has(m)) &&
      blockEnergy[m] === explicitEnergy
    ) {
      if (avail[m] === 2) explicit = true;
      m++;
    }
    const end = m;
    const length = end - start;
    if (length < MIN_WINDOW_MINUTES) continue;

    const periodEnergy = levelByPeriod.get(period);
    const base = explicitEnergy
      ? ENERGY_SCORE[explicitEnergy]
      : ENERGY_SCORE[periodEnergy?.level ?? "NORMAL"] + (periodEnergy?.learnedDelta ?? 0);
    const mandatoryBefore = mandatoryMinutesBefore(blocks, start);
    const score = base - fatiguePenalty(mandatoryBefore, start);

    windows.push({
      dayOfWeek,
      start,
      end,
      slotClass: classify(score, length),
      energyScore: Math.round(score * 100) / 100,
      explicit,
      mandatoryBefore,
    });
  }
  return windows;
}

export function weeklyWindows(blocks: RoutineBlockInput[], energy: EnergyInput[] = DEFAULT_ENERGY) {
  return [1, 2, 3, 4, 5, 6, 7].map((d) => windowsForDay(d, blocks, energy));
}

/** Removes occupied intervals (e.g. already scheduled items) from windows. */
export function subtractIntervals(
  windows: StudyWindow[],
  occupied: { start: number; end: number }[],
  padding = 0,
): StudyWindow[] {
  let result = windows;
  for (const occ of occupied) {
    const s = occ.start - padding;
    const e = occ.end + padding;
    const next: StudyWindow[] = [];
    for (const w of result) {
      if (e <= w.start || s >= w.end) {
        next.push(w);
        continue;
      }
      if (s > w.start) next.push({ ...w, end: s });
      if (e < w.end) next.push({ ...w, start: e });
    }
    result = next;
  }
  return result
    .filter((w) => w.end - w.start >= MIN_WINDOW_MINUTES)
    .map((w) => ({ ...w, slotClass: w.end - w.start < 25 ? "C" : w.slotClass }));
}
