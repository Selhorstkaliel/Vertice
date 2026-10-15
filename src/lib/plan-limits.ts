import "server-only";
import { env, isProduction } from "@/lib/env";

/**
 * Usage limits per student. Today every student has the same limits, read from
 * environment variables; when subscription plans exist, this is the single
 * place that will look the student's plan up instead.
 */
export interface UsageLimits {
  mentorDailyMessages: number;
  mentorMaxRounds: number;
  essayCorrectionsPerMonth: number;
  essayRewritesPerMonth: number;
}

export function limitsFor(_user: { id: string }): UsageLimits {
  return {
    mentorDailyMessages: env.MENTOR_DAILY_LIMIT,
    mentorMaxRounds: env.MENTOR_MAX_ROUNDS,
    essayCorrectionsPerMonth: env.ESSAY_MONTHLY_LIMIT,
    essayRewritesPerMonth: env.ESSAY_REWRITE_MONTHLY_LIMIT,
  };
}

/** The essay area stays off in production until calibration passes (ESSAYS_ENABLED=on). */
export function essaysEnabled(user?: { isAdmin: boolean } | null) {
  if (user?.isAdmin) return true;
  return env.ESSAYS_ENABLED ? env.ESSAYS_ENABLED === "on" : !isProduction;
}
