/**
 * TAF tracking (§46). Organizes what the student records; it never prescribes
 * training. All values are the student's own marks and targets.
 */

export type MeasureUnit = "SECONDS" | "REPS" | "METERS" | "KILOGRAMS";
export type BetterWhen = "LOWER" | "HIGHER";

export interface TafResultInput {
  dateKey: string;
  value: number;
}

export interface TafSummary {
  count: number;
  first: TafResultInput | null;
  latest: TafResultInput | null;
  best: TafResultInput | null;
  /** Latest minus first, signed so that positive always means improvement. */
  improvement: number | null;
  /** How far the latest mark is from the target, in the unit; 0 when met. */
  gapToTarget: number | null;
  targetMet: boolean | null;
  /** Share of the way from the first mark to the target, 0..1. */
  progressToTarget: number | null;
}

const better = (a: number, b: number, when: BetterWhen) => (when === "LOWER" ? a < b : a > b);

export function summarizeTaf(results: TafResultInput[], betterWhen: BetterWhen, target: number | null): TafSummary {
  const sorted = [...results].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  const first = sorted[0] ?? null;
  const latest = sorted.at(-1) ?? null;
  let best: TafResultInput | null = null;
  for (const r of sorted) if (!best || better(r.value, best.value, betterWhen)) best = r;

  const sign = betterWhen === "LOWER" ? -1 : 1;
  const improvement = first && latest && sorted.length > 1 ? (latest.value - first.value) * sign : null;

  let gapToTarget: number | null = null;
  let targetMet: boolean | null = null;
  let progressToTarget: number | null = null;
  if (target !== null && latest) {
    const gap = (target - latest.value) * sign;
    targetMet = gap <= 0;
    gapToTarget = Math.max(0, gap);
    if (first) {
      const total = (target - first.value) * sign;
      if (targetMet) progressToTarget = 1;
      else if (total > 0) progressToTarget = Math.min(1, Math.max(0, ((latest.value - first.value) * sign) / total));
      else progressToTarget = 0;
    }
  }

  return { count: sorted.length, first, latest, best, improvement, gapToTarget, targetMet, progressToTarget };
}

/** "13:20", "1:02:05" for SECONDS; plain numbers otherwise. */
export function formatMeasure(value: number, unit: MeasureUnit): string {
  if (unit === "SECONDS") {
    const total = Math.round(value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  return unit === "REPS" ? `${text} rep.` : unit === "METERS" ? `${text} m` : `${text} kg`;
}

/** Accepts "13:20", "1:02:05", "800" (seconds) or decimal numbers with comma. Returns null when invalid. */
export function parseMeasure(input: string, unit: MeasureUnit): number | null {
  const text = input.trim().replace(",", ".");
  if (!text) return null;
  if (unit === "SECONDS" && text.includes(":")) {
    const parts = text.split(":");
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    const nums = parts.map(Number);
    if (nums.slice(1).some((n) => n >= 60)) return null;
    const value = nums.reduce((acc, n) => acc * 60 + n, 0);
    return value > 0 ? value : null;
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "REPS" && !Number.isInteger(value)) return null;
  return value;
}
