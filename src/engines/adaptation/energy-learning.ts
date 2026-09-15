import { formatPercent } from "@/lib/format";
import { clamp } from "@/lib/utils";
import type { DayPeriodName } from "@/lib/time";

/**
 * Adaptation Engine — learns how each part of the day actually performs (§27).
 *
 * Compares accuracy and self-rated focus per period with the student's own
 * averages. Small, bounded adjustments only, and none without enough evidence.
 */

export const ENERGY_LEARNING_VERSION = "energy-1.0";
export const MIN_PERIOD_ANSWERS = 40;
export const MIN_TOTAL_ANSWERS = 150;
export const MIN_PERIOD_RATED_SESSIONS = 8;
export const MIN_TOTAL_RATED_SESSIONS = 20;

export interface PeriodPerformance {
  period: DayPeriodName;
  answered: number;
  correct: number;
  ratedSessions: number;
  focusSum: number;
}

export interface LearnedEnergy {
  period: DayPeriodName;
  /** Added to the declared energy score, in quarter steps within −1..1. */
  delta: number;
  answered: number;
  accuracy: number | null;
  overallAccuracy: number | null;
  ratedSessions: number;
  focusAverage: number | null;
  overallFocus: number | null;
  /** Human explanation, present only when delta ≠ 0. */
  reason: string | null;
}

const decimal = (v: number) => v.toFixed(1).replace(".", ",");

export function learnEnergy(periods: PeriodPerformance[]): LearnedEnergy[] {
  const totalAnswered = periods.reduce((a, p) => a + p.answered, 0);
  const totalCorrect = periods.reduce((a, p) => a + p.correct, 0);
  const totalRated = periods.reduce((a, p) => a + p.ratedSessions, 0);
  const totalFocus = periods.reduce((a, p) => a + p.focusSum, 0);
  const overallAccuracy = totalAnswered >= MIN_TOTAL_ANSWERS ? totalCorrect / totalAnswered : null;
  const overallFocus = totalRated >= MIN_TOTAL_RATED_SESSIONS ? totalFocus / totalRated : null;

  return periods.map((p) => {
    const reasons: string[] = [];
    let delta = 0;

    const accuracy = p.answered >= MIN_PERIOD_ANSWERS ? p.correct / p.answered : null;
    if (accuracy !== null && overallAccuracy !== null) {
      const diff = accuracy - overallAccuracy;
      if (Math.abs(diff) >= 0.04) {
        delta += clamp((diff / 0.08) * 0.5, -0.75, 0.75);
        reasons.push(`${formatPercent(accuracy)} de acertos em ${p.answered} questões, contra ${formatPercent(overallAccuracy)} no geral`);
      }
    }

    const focusAverage = p.ratedSessions >= MIN_PERIOD_RATED_SESSIONS ? p.focusSum / p.ratedSessions : null;
    if (focusAverage !== null && overallFocus !== null) {
      const diff = focusAverage - overallFocus;
      if (Math.abs(diff) >= 0.4) {
        delta += clamp((diff / 0.8) * 0.25, -0.25, 0.25);
        reasons.push(`foco médio de ${decimal(focusAverage)} em 5 em ${p.ratedSessions} sessões, contra ${decimal(overallFocus)} no geral`);
      }
    }

    delta = Math.round(clamp(delta, -1, 1) * 4) / 4;
    const reason = delta !== 0 && reasons.length ? `${reasons.join("; ")}.` : null;
    return {
      period: p.period,
      delta: Object.is(delta, -0) ? 0 : delta,
      answered: p.answered,
      accuracy,
      overallAccuracy,
      ratedSessions: p.ratedSessions,
      focusAverage,
      overallFocus,
      reason: reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : null,
    };
  });
}
