import { z } from "zod";

/**
 * Exam scoring by the competition's rule (pure).
 *
 * - RIGHT_COUNT: each correct answer is worth the subject weight.
 * - PENALTY: each wrong answer cancels `wrongPenalty` correct answers of the
 *   same subject (Cebraspe: 1). Blank answers are worth zero in both modes —
 *   that is why leaving a question blank matters under PENALTY.
 * - Minimums are shares (0..1) of the maximum, so they apply to a simulation
 *   with fewer questions than the real exam in the same proportion.
 *
 * The rule itself comes from the edital, registered with its source; this
 * engine never assumes one.
 */

export const ruleSubjectSchema = z.object({
  subjectId: z.string().min(1),
  weight: z.number().positive().max(100),
  /** Questions of the subject in the real exam, when known. */
  questions: z.number().int().positive().max(500).nullable().optional(),
  /** Minimum share 0..1 of the subject's maximum. */
  minShare: z.number().min(0).max(1).nullable().optional(),
});
export const ruleSubjectsSchema = z.array(ruleSubjectSchema).max(40);
export type RuleSubject = z.infer<typeof ruleSubjectSchema>;

export interface ScoringRuleInput {
  mode: "RIGHT_COUNT" | "PENALTY";
  wrongPenalty: number | null;
  subjects: RuleSubject[];
  minTotalShare: number | null;
}

export type Outcome = "CORRECT" | "WRONG" | "BLANK";

export interface SubjectScore {
  subjectId: string;
  weight: number;
  /** False when the subject is not in the rule and was counted with weight 1. */
  inRule: boolean;
  correct: number;
  wrong: number;
  blank: number;
  points: number;
  maxPoints: number;
  share: number;
  minShare: number | null;
  belowMinimum: boolean;
}

export interface ScoreResult {
  mode: ScoringRuleInput["mode"];
  wrongPenalty: number;
  points: number;
  maxPoints: number;
  /** points / maxPoints; can be negative under PENALTY. */
  share: number;
  bySubject: SubjectScore[];
  belowTotalMinimum: boolean;
  /** Below a subject or total minimum set by the rule. */
  eliminated: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function scoreAttempt(rule: ScoringRuleInput, outcomes: { subjectId: string; outcome: Outcome }[]): ScoreResult {
  const penalty = rule.mode === "PENALTY" ? Math.max(0, rule.wrongPenalty ?? 1) : 0;
  const ruleBySubject = new Map(rule.subjects.map((s) => [s.subjectId, s]));
  const tally = new Map<string, { correct: number; wrong: number; blank: number }>();
  for (const o of outcomes) {
    const t = tally.get(o.subjectId) ?? { correct: 0, wrong: 0, blank: 0 };
    if (o.outcome === "CORRECT") t.correct++;
    else if (o.outcome === "WRONG") t.wrong++;
    else t.blank++;
    tally.set(o.subjectId, t);
  }

  const bySubject: SubjectScore[] = [...tally.entries()].map(([subjectId, t]) => {
    const r = ruleBySubject.get(subjectId);
    const weight = r?.weight ?? 1;
    const total = t.correct + t.wrong + t.blank;
    const points = weight * (t.correct - penalty * t.wrong);
    const maxPoints = weight * total;
    const share = maxPoints > 0 ? points / maxPoints : 0;
    const minShare = r?.minShare ?? null;
    return {
      subjectId,
      weight,
      inRule: !!r,
      correct: t.correct,
      wrong: t.wrong,
      blank: t.blank,
      points: round2(points),
      maxPoints: round2(maxPoints),
      share,
      minShare,
      belowMinimum: minShare !== null && share < minShare,
    };
  });

  const points = bySubject.reduce((a, s) => a + s.points, 0);
  const maxPoints = bySubject.reduce((a, s) => a + s.maxPoints, 0);
  const share = maxPoints > 0 ? points / maxPoints : 0;
  const belowTotalMinimum = rule.minTotalShare !== null && share < rule.minTotalShare;
  return {
    mode: rule.mode,
    wrongPenalty: penalty,
    points: round2(points),
    maxPoints: round2(maxPoints),
    share,
    bySubject,
    belowTotalMinimum,
    eliminated: belowTotalMinimum || bySubject.some((s) => s.belowMinimum),
  };
}

/**
 * Compares the simulation with a cut-off "score of max" from the real exam.
 * The simulation may have fewer questions, so the comparison is by share.
 */
export function compareWithCutoff(share: number, cutoff: { score: number; max: number } | null) {
  if (!cutoff || cutoff.max <= 0) return null;
  const cutoffShare = cutoff.score / cutoff.max;
  return { cutoffShare, gap: share - cutoffShare, above: share >= cutoffShare, equivalentPoints: share * cutoff.max };
}

/**
 * Questions where the student spent more than their usual time per question,
 * split by result. `averageSec` is the student's own average; without one
 * (no history) the simulation's own average is used.
 */
export function slowQuestions<T extends { timeSpentSec: number; outcome: Outcome }>(items: T[], averageSec: number | null) {
  const timed = items.filter((i) => i.timeSpentSec > 0);
  const base = averageSec ?? (timed.length ? timed.reduce((a, i) => a + i.timeSpentSec, 0) / timed.length : null);
  if (base === null || base <= 0) return { averageSec: null, wrong: [] as T[], other: [] as T[] };
  const slow = timed.filter((i) => i.timeSpentSec > base).sort((a, b) => b.timeSpentSec - a.timeSpentSec);
  return { averageSec: Math.round(base), wrong: slow.filter((i) => i.outcome === "WRONG"), other: slow.filter((i) => i.outcome !== "WRONG") };
}

/** Exam-mode time: the official duration scaled to the questions actually drawn. */
export function examModeMinutes(durationMinutes: number, officialQuestions: number | null, drawn: number) {
  if (!officialQuestions || officialQuestions <= 0 || drawn >= officialQuestions) return durationMinutes;
  return Math.max(5, Math.round((durationMinutes * drawn) / officialQuestions));
}
