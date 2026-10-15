/**
 * Calibration of the essay correction against human grades (pure). For one
 * model: mean absolute difference per criterion and in the total, how many
 * human grades fell outside the estimated range, the mean disagreement
 * between the two AI runs and the mean cost per correction.
 */

export interface CalibrationCase {
  id: string;
  maxScore: number;
  human: { total: number; criteria?: Record<string, number> };
  ai: { totalMin: number; totalMax: number; totalMid: number; disagreement: number; criteria: Record<string, number>; criteriaMax: Record<string, number> };
  /** Both runs together, USD; null when the model has no price registered. */
  costUsd: number | null;
}

export interface CalibrationStats {
  cases: number;
  /** Mean |AI midpoint − human| over the total, in points and as share of the maximum. */
  meanAbsTotal: number;
  meanAbsTotalShare: number;
  perCriterion: { key: string; meanAbs: number; meanAbsShare: number; cases: number }[];
  outsideRange: number;
  outsideRangeShare: number;
  meanDisagreement: number;
  meanCostUsd: number | null;
}

export function calibrationStats(cases: CalibrationCase[]): CalibrationStats {
  const n = cases.length;
  if (n === 0) return { cases: 0, meanAbsTotal: 0, meanAbsTotalShare: 0, perCriterion: [], outsideRange: 0, outsideRangeShare: 0, meanDisagreement: 0, meanCostUsd: null };
  const abs = cases.map((c) => Math.abs(c.ai.totalMid - c.human.total));
  const outside = cases.filter((c) => c.human.total < c.ai.totalMin || c.human.total > c.ai.totalMax).length;
  const per = new Map<string, { sum: number; share: number; n: number }>();
  for (const c of cases) {
    for (const [key, h] of Object.entries(c.human.criteria ?? {})) {
      const a = c.ai.criteria[key];
      if (a === undefined) continue;
      const e = per.get(key) ?? { sum: 0, share: 0, n: 0 };
      e.sum += Math.abs(a - h);
      e.share += c.ai.criteriaMax[key] ? Math.abs(a - h) / c.ai.criteriaMax[key]! : 0;
      e.n++;
      per.set(key, e);
    }
  }
  const costs = cases.map((c) => c.costUsd).filter((c): c is number => c !== null);
  return {
    cases: n,
    meanAbsTotal: abs.reduce((a, v) => a + v, 0) / n,
    meanAbsTotalShare: cases.reduce((a, c, i) => a + (c.maxScore ? abs[i]! / c.maxScore : 0), 0) / n,
    perCriterion: [...per].map(([key, e]) => ({ key, meanAbs: e.sum / e.n, meanAbsShare: e.share / e.n, cases: e.n })),
    outsideRange: outside,
    outsideRangeShare: outside / n,
    meanDisagreement: cases.reduce((a, c) => a + c.ai.disagreement, 0) / n,
    meanCostUsd: costs.length === n ? costs.reduce((a, v) => a + v, 0) / n : null,
  };
}

/** Cheapest model whose error and out-of-range share stay within the limits; null if none passes. */
export function pickModel(results: { model: string; stats: CalibrationStats }[], limits: { maxErrorShare: number; maxOutsideShare: number }) {
  const passing = results.filter((r) => r.stats.cases > 0 && r.stats.meanAbsTotalShare <= limits.maxErrorShare && r.stats.outsideRangeShare <= limits.maxOutsideShare);
  return passing.sort((a, b) => (a.stats.meanCostUsd ?? Infinity) - (b.stats.meanCostUsd ?? Infinity))[0] ?? null;
}
