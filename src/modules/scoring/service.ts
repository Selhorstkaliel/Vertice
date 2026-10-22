import "server-only";
import { db } from "@/lib/db";
import { ruleDaysSchema, ruleSubjectsSchema, type RuleDay, type RuleSubject, type ScoringRuleInput } from "@/engines/simulations/scoring";

export function parseRuleSubjects(value: unknown): RuleSubject[] {
  const parsed = ruleSubjectsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseRuleDays(value: unknown): RuleDay[] {
  const parsed = ruleDaysSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const ruleSelect = {
  id: true,
  competitionId: true,
  year: true,
  mode: true,
  wrongPenalty: true,
  durationMinutes: true,
  subjects: true,
  days: true,
  minTotalShare: true,
  cutoffScore: true,
  maxScore: true,
  sourceUrl: true,
  sourceNote: true,
  verification: true,
  updatedAt: true,
} as const;

export type ScoringRuleRow = Awaited<ReturnType<typeof listRules>>[number];

export async function listRules(competitionId?: string) {
  const rows = await db.scoringRule.findMany({
    where: competitionId ? { competitionId } : {},
    select: { ...ruleSelect, competition: { select: { name: true } } },
    orderBy: [{ competition: { name: "asc" } }, { year: "desc" }],
  });
  return rows.map((r) => ({ ...r, subjects: parseRuleSubjects(r.subjects), days: parseRuleDays(r.days) }));
}

/**
 * The rule that scores a competition's simulations: the most recent year,
 * from the catalog competition when the student customized the edital.
 */
export async function ruleForCompetition(competitionId: string) {
  const c = await db.competition.findUnique({ where: { id: competitionId }, select: { id: true, forkedFromId: true } });
  if (!c) return null;
  const rule = await db.scoringRule.findFirst({
    where: { competitionId: c.forkedFromId ?? c.id },
    select: ruleSelect,
    orderBy: [{ year: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
  return rule ? { ...rule, subjects: parseRuleSubjects(rule.subjects), days: parseRuleDays(rule.days) } : null;
}

export function toEngineRule(rule: { mode: ScoringRuleInput["mode"]; wrongPenalty: number | null; subjects: RuleSubject[]; minTotalShare: number | null }): ScoringRuleInput {
  return { mode: rule.mode, wrongPenalty: rule.wrongPenalty, subjects: rule.subjects, minTotalShare: rule.minTotalShare };
}

/** Questions of the real exam: the rule's per-subject counts, else the edital's, else unknown. */
export function officialQuestionCount(rule: { subjects: RuleSubject[] } | null, editalCounts: (number | null)[]) {
  const fromRule = rule?.subjects.map((s) => s.questions ?? null) ?? [];
  if (fromRule.length && fromRule.every((n) => n !== null)) return fromRule.reduce<number>((a, n) => a + (n ?? 0), 0);
  if (editalCounts.length && editalCounts.every((n) => n !== null)) return editalCounts.reduce<number>((a, n) => a + (n ?? 0), 0);
  return null;
}
