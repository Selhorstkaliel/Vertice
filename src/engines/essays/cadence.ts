import { diffDays, type DateKey } from "@/lib/time";

/**
 * Essay cadence: how many essays per week, rising as the exam approaches.
 * Pure. The thresholds are hypotheses to tune, not rules from any edital:
 *
 * - more than 6 months to the exam: 1 per week;
 * - 3 to 6 months: 2;
 * - under 3 months: 3;
 * - last 4 weeks: 3, one of them timed in the real format.
 *
 * Without a trusted exam date, 1 per week. The target never exceeds what the
 * week's free study time and the daily limit allow; when it has to shrink,
 * the reason is returned so the screen can say it.
 */

export const DEFAULT_ESSAY_MINUTES = 75;
const SIX_MONTHS = 182;
const THREE_MONTHS = 91;
const FOUR_WEEKS = 28;

export interface CadenceInput {
  today: DateKey;
  /** Competition date (only if verified) or the student's own; null when unknown. */
  examDate: DateKey | null;
  /** Free study minutes left in the routine this week; null when the routine is empty. */
  weeklyFreeMinutes: number | null;
  /** Profile.dailyStudyLimitMin. */
  dailyLimitMinutes: number;
  /** Writing plus self-review time for one essay. */
  essayMinutes?: number;
  /** Essays already submitted this week. */
  doneThisWeek: number;
}

export interface Cadence {
  /** Essays per week the schedule calls for, before fitting the routine. */
  ideal: number;
  /** Essays per week that fit. */
  perWeek: number;
  /** How many of them should be timed, in the real format. */
  timed: number;
  remainingThisWeek: number;
  daysToExam: number | null;
  phase: "NO_DATE" | "FAR" | "MID" | "NEAR" | "FINAL" | "PAST";
  reason: string;
  /** Set when the routine forced a smaller number. */
  reducedBecause: string | null;
}

export function essayCadence(input: CadenceInput): Cadence {
  const minutes = input.essayMinutes ?? DEFAULT_ESSAY_MINUTES;
  const days = input.examDate ? diffDays(input.today, input.examDate) : null;

  let phase: Cadence["phase"];
  let ideal: number;
  let timed = 0;
  let reason: string;
  if (days === null) {
    phase = "NO_DATE";
    ideal = 1;
    reason = "Sem data de prova confirmada: uma redação por semana.";
  } else if (days < 0) {
    phase = "PAST";
    ideal = 0;
    reason = "A data da prova já passou. Atualize a data do concurso para retomar a cadência.";
  } else if (days <= FOUR_WEEKS) {
    phase = "FINAL";
    ideal = 3;
    timed = 1;
    reason = `Faltam ${days} dias: três redações por semana, uma delas cronometrada no formato da prova.`;
  } else if (days < THREE_MONTHS) {
    phase = "NEAR";
    ideal = 3;
    reason = `Faltam ${days} dias (menos de 3 meses): três redações por semana.`;
  } else if (days <= SIX_MONTHS) {
    phase = "MID";
    ideal = 2;
    reason = `Faltam ${days} dias (entre 3 e 6 meses): duas redações por semana.`;
  } else {
    phase = "FAR";
    ideal = 1;
    reason = `Faltam ${days} dias (mais de 6 meses): uma redação por semana.`;
  }

  let perWeek = ideal;
  let reducedBecause: string | null = null;
  if (ideal > 0 && minutes > input.dailyLimitMinutes) {
    perWeek = 0;
    reducedBecause = `Uma redação leva cerca de ${minutes} minutos, mais que o seu limite diário de ${input.dailyLimitMinutes} minutos. Aumente o limite em Configurações para incluir redação.`;
  } else if (ideal > 0 && input.weeklyFreeMinutes !== null) {
    // Fits on top of what was already written this week.
    const fit = input.doneThisWeek + Math.floor(Math.max(0, input.weeklyFreeMinutes) / minutes);
    if (fit < ideal) {
      perWeek = Math.max(input.doneThisWeek, fit);
      reducedBecause =
        perWeek === 0
          ? "A rotina desta semana não tem um bloco livre de cerca de " + minutes + " minutos para redação."
          : `A rotina desta semana só comporta ${perWeek} ${perWeek === 1 ? "redação" : "redações"} de cerca de ${minutes} minutos.`;
    }
  }
  return {
    ideal,
    perWeek,
    timed: Math.min(timed, perWeek),
    remainingThisWeek: Math.max(0, perWeek - input.doneThisWeek),
    daysToExam: days,
    phase,
    reason,
    reducedBecause,
  };
}
