import { formatMinutes } from "@/lib/format";
import type { WeekHistory } from "../types";

/**
 * Detects a weekly goal the student has repeatedly been unable to reach (§34)
 * and suggests a sustainable one: a little above what has actually been done.
 * Shared by the routine analyzer (diagnostic) and the adaptive recommendation.
 */

export const GOAL_REALISM_WEEKS = 3;
/** The goal is unrealistic when average execution stays below this share of it. */
export const GOAL_MISS_SHARE = 0.7;
/** Suggested goal = average execution × this margin, rounded to 30 minutes. */
export const GOAL_MARGIN = 1.15;
const MIN_SUGGESTED_MINUTES = 120;

export interface GoalRealismSuggestion {
  averageMinutes: number;
  targetMinutes: number;
  suggestedMinutes: number;
  weeks: WeekHistory[];
  reason: string;
}

/** `history`: finished weeks, most recent first. Only weeks that had a plan count. */
export function checkGoalRealism(targetMinutes: number | null, history: WeekHistory[]): GoalRealismSuggestion | null {
  if (!targetMinutes || targetMinutes <= 0) return null;
  const weeks = history.filter((h) => h.plannedMinutes > 0).slice(0, GOAL_REALISM_WEEKS);
  if (weeks.length < GOAL_REALISM_WEEKS) return null;

  const averageMinutes = weeks.reduce((a, w) => a + w.executedMinutes, 0) / weeks.length;
  if (averageMinutes >= targetMinutes * GOAL_MISS_SHARE) return null;

  const suggestedMinutes = Math.round(Math.max(averageMinutes * GOAL_MARGIN, MIN_SUGGESTED_MINUTES) / 30) * 30;
  if (suggestedMinutes >= targetMinutes) return null;

  return {
    averageMinutes,
    targetMinutes,
    suggestedMinutes,
    weeks,
    reason:
      `Nas últimas ${weeks.length} semanas sua execução média foi de ${formatMinutes(averageMinutes)}, abaixo de ${Math.round(GOAL_MISS_SHARE * 100)}% da meta atual de ${formatMinutes(targetMinutes)}. ` +
      `Reduzir temporariamente a meta para cerca de ${formatMinutes(suggestedMinutes)}, pouco acima do que você tem conseguido, deixa o plano mais realista. Você pode voltar a subir quando a execução acompanhar.`,
  };
}
