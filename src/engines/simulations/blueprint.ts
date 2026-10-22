import type { RuleSubject } from "./scoring";

/**
 * Shape of the real exam, for the "simulado da prova real" (pure).
 *
 * Source, in order: the edital's scoring rule when every subject has its
 * question count (and day, when the exam has more than one); otherwise the
 * most recent official papers, one part per exam day ("1º dia", "2º dia") or,
 * without days, one part per paper (different booklets of the same exam).
 * Counts from a paper are scaled to the questions it officially had, since
 * annulled or unread questions are missing from the bank.
 */

export interface PaperInput {
  id: string;
  year: number;
  version: string;
  /** Questions the paper officially had. */
  expectedCount: number | null;
  subjects: { subjectId: string; questions: number }[];
}

export interface BlueprintPart {
  key: string;
  label: string;
  day: number | null;
  subjects: { subjectId: string; questions: number }[];
  total: number;
}

export interface Blueprint {
  source: "EDITAL" | "PAPERS";
  /** Year of the papers or of the edital rule. */
  year: number | null;
  parts: BlueprintPart[];
}

/** "1º dia, prova amarela" → 1; "2º Dia" → 2; anything else → null. */
export function examDayOf(version: string): number | null {
  const m = /(\d+)\s*[ºª°o]?\s*dia\b/i.exec(version);
  return m ? Number(m[1]) : null;
}

/** Largest remainder: integer counts proportional to `counts` that add up to `target`. */
export function scaleCounts(counts: number[], target: number): number[] {
  const sum = counts.reduce((a, n) => a + n, 0);
  if (sum === 0 || target <= 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n * target) / sum);
  const out = raw.map(Math.floor);
  let rest = target - out.reduce((a, n) => a + n, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i]!++;
    rest--;
  }
  return out;
}

function part(key: string, label: string, day: number | null, subjects: { subjectId: string; questions: number }[]): BlueprintPart {
  const kept = subjects.filter((s) => s.questions > 0);
  return { key, label, day, subjects: kept, total: kept.reduce((a, s) => a + s.questions, 0) };
}

function fromPaper(p: PaperInput) {
  const found = p.subjects.reduce((a, s) => a + s.questions, 0);
  // A single question of a subject in a long paper is a misfiled question, not a section of the exam.
  const subjects = found >= 30 ? p.subjects.filter((s) => s.questions > 1) : p.subjects;
  const counts = subjects.map((s) => s.questions);
  const target = p.expectedCount && p.expectedCount > found ? p.expectedCount : found;
  const scaled = scaleCounts(counts, target);
  return subjects.map((s, i) => ({ subjectId: s.subjectId, questions: scaled[i]! }));
}

export function buildBlueprint(input: { papers: PaperInput[]; rule?: { year: number | null; subjects: RuleSubject[] } | null }): Blueprint | null {
  const rule = input.rule;
  if (rule && rule.subjects.length && rule.subjects.every((s) => s.questions)) {
    const days = [...new Set(rule.subjects.map((s) => s.day ?? null))];
    const multi = days.length > 1 && days.every((d) => d !== null);
    const parts = multi
      ? (days as number[]).sort((a, b) => a - b).map((d) => part(`dia-${d}`, `${d}º dia`, d, rule.subjects.filter((s) => s.day === d).map((s) => ({ subjectId: s.subjectId, questions: s.questions! }))))
      : [part("prova", "Prova objetiva", null, rule.subjects.map((s) => ({ subjectId: s.subjectId, questions: s.questions! })))];
    return { source: "EDITAL", year: rule.year, parts };
  }

  const withQuestions = input.papers.filter((p) => p.subjects.some((s) => s.questions > 0));
  if (!withQuestions.length) return null;
  const year = Math.max(...withQuestions.map((p) => p.year));
  const latest = withQuestions.filter((p) => p.year === year).sort((a, b) => a.version.localeCompare(b.version, "pt-BR"));

  const byDay = new Map<number, PaperInput>();
  for (const p of latest) {
    const d = examDayOf(p.version);
    // Same day in another color/version is the same exam: keep the first.
    if (d !== null && !byDay.has(d)) byDay.set(d, p);
  }
  const parts = byDay.size
    ? [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, p]) => part(`dia-${d}`, `${d}º dia`, d, fromPaper(p)))
    : latest.map((p, i) => part(latest.length === 1 ? "prova" : `caderno-${i + 1}`, latest.length === 1 ? "Prova objetiva" : p.version, null, fromPaper(p)));
  return { source: "PAPERS", year, parts: parts.filter((p) => p.total > 0) };
}

/**
 * Half from past official exams, half generated in the board's style, per
 * subject; the shortfall of one side is filled by the other.
 */
export function mixQuota(questions: number, official: number, generated: number) {
  let fromOfficial = Math.min(official, Math.ceil(questions / 2));
  let fromGenerated = Math.min(generated, questions - fromOfficial);
  fromOfficial = Math.min(official, questions - fromGenerated);
  fromGenerated = Math.min(generated, questions - fromOfficial);
  return { official: fromOfficial, generated: fromGenerated, missing: questions - fromOfficial - fromGenerated };
}

/** Official time when known; otherwise an estimate of 3 minutes per question, flagged as such. */
export function partMinutes(part: BlueprintPart, rule: { durationMinutes: number | null; days?: { day: number; durationMinutes: number }[] | null } | null, partCount: number) {
  const day = part.day !== null ? rule?.days?.find((d) => d.day === part.day) : undefined;
  if (day) return { minutes: day.durationMinutes, estimated: false };
  if (rule?.durationMinutes && partCount === 1) return { minutes: rule.durationMinutes, estimated: false };
  return { minutes: Math.max(30, Math.round((part.total * 3) / 5) * 5), estimated: true };
}
