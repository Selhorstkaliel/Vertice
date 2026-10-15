/**
 * Pure helpers for essay correction: line estimates and the combination of
 * two independent AI corrections into a range. AI output is never assumed
 * right: scores are clamped to the rubric, quoted excerpts must exist in the
 * student's text, and disagreement widens the range.
 */

export interface RubricCriterion {
  key: string;
  name: string;
  description: string;
  maxScore: number;
  weight: number;
}

/* ── lines ────────────────────────────────────────────────────────── */

export function paragraphsOf(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Handwritten lines estimated from typed text: each paragraph starts a new line. */
export function estimateLines(text: string, charsPerLine: number) {
  const per = Math.max(20, charsPerLine);
  return paragraphsOf(text).reduce((a, p) => a + Math.max(1, Math.ceil(p.length / per)), 0);
}

export function lineCheck(lines: number, minLines: number | null, maxLines: number | null) {
  if (minLines !== null && lines < minLines) return { ok: false as const, message: `Cerca de ${lines} linhas: abaixo do mínimo de ${minLines} da folha oficial.` };
  if (maxLines !== null && lines > maxLines) return { ok: false as const, message: `Cerca de ${lines} linhas: acima do máximo de ${maxLines} da folha oficial.` };
  return { ok: true as const, message: `Cerca de ${lines} linhas${maxLines ? `; a folha oficial tem ${maxLines}` : ""}.` };
}

/* ── combining two runs ───────────────────────────────────────────── */

export interface RunCriterion {
  key: string;
  score: number;
  excerpt: string;
  comment: string;
}

export interface CorrectionRun {
  criteria: RunCriterion[];
  zeroed: boolean;
  zeroReason: string;
  issues: { title: string; explanation: string; excerpt: string }[];
  exercise: { paragraph: number; criterionKey: string; instruction: string };
}

export interface CombinedCriterion {
  key: string;
  name: string;
  maxScore: number;
  weight: number;
  score: number;
  min: number;
  max: number;
  /** Null when neither run quoted a passage that actually exists in the text. */
  excerpt: string | null;
  comment: string;
}

export interface CombinedCorrection {
  scores: CombinedCriterion[];
  totalMin: number;
  totalMax: number;
  totalMid: number;
  maxScore: number;
  disagreement: number;
  uncertain: boolean;
  zeroFlag: string | null;
  topIssues: { title: string; explanation: string; excerpt: string | null }[];
  exercise: { index: number; criterionKey: string; instruction: string } | null;
}

const norm = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The excerpt only counts if it is really in the essay (AI quotes can be invented). */
export function verifiedExcerpt(excerpt: string, text: string): string | null {
  const e = norm(excerpt).replace(/^\.+|\.+$/g, "").trim();
  if (e.length < 3) return null;
  return norm(text).includes(e) ? excerpt.trim() : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function combineRuns(
  criteria: RubricCriterion[],
  runs: [CorrectionRun, CorrectionRun],
  text: string,
  opts: { margin: number; threshold: number; paragraphCount: number },
): CombinedCorrection {
  const maxScore = criteria.reduce((a, c) => a + c.maxScore * c.weight, 0);
  const totals = runs.map((r) => criteria.reduce((a, c) => a + clamp(r.criteria.find((x) => x.key === c.key)?.score ?? 0, 0, c.maxScore) * c.weight, 0));
  const disagreement = maxScore > 0 ? Math.abs(totals[0]! - totals[1]!) / maxScore : 0;
  const uncertain = disagreement > opts.threshold || runs[0].zeroed !== runs[1].zeroed;

  const scores = criteria.map((c) => {
    const [a, b] = runs.map((r) => r.criteria.find((x) => x.key === c.key));
    const sa = clamp(a?.score ?? 0, 0, c.maxScore);
    const sb = clamp(b?.score ?? 0, 0, c.maxScore);
    const pad = c.maxScore * opts.margin * (uncertain ? 2 : 1);
    const excerpt = (a && verifiedExcerpt(a.excerpt, text)) ?? (b && verifiedExcerpt(b.excerpt, text)) ?? null;
    return {
      key: c.key,
      name: c.name,
      maxScore: c.maxScore,
      weight: c.weight,
      score: round1((sa + sb) / 2),
      min: round1(clamp(Math.min(sa, sb) - pad, 0, c.maxScore)),
      max: round1(clamp(Math.max(sa, sb) + pad, 0, c.maxScore)),
      excerpt,
      comment: (a?.comment || b?.comment || "").trim(),
    };
  });

  const bothZero = runs[0].zeroed && runs[1].zeroed;
  const pad = maxScore * opts.margin * (uncertain ? 2 : 1);
  let totalMin = clamp(Math.min(...totals) - pad, 0, maxScore);
  let totalMax = clamp(Math.max(...totals) + pad, 0, maxScore);
  if (bothZero) {
    totalMin = 0;
    totalMax = 0;
  } else if (runs[0].zeroed || runs[1].zeroed) {
    // One run would zero the essay: the honest range starts at zero.
    totalMin = 0;
  }
  const zeroFlag = runs[0].zeroed ? runs[0].zeroReason || "Possível motivo de nota zero." : runs[1].zeroed ? runs[1].zeroReason || "Possível motivo de nota zero." : null;

  const ex = runs[0].exercise;
  const exerciseValid = ex.paragraph >= 1 && ex.paragraph <= opts.paragraphCount && criteria.some((c) => c.key === ex.criterionKey);

  return {
    scores,
    totalMin: round1(totalMin),
    totalMax: round1(totalMax),
    totalMid: round1(bothZero ? 0 : (totals[0]! + totals[1]!) / 2),
    maxScore,
    disagreement: Math.round(disagreement * 1000) / 1000,
    uncertain,
    zeroFlag,
    topIssues: runs[0].issues.slice(0, 3).map((i) => ({ title: i.title.trim(), explanation: i.explanation.trim(), excerpt: verifiedExcerpt(i.excerpt, text) })),
    exercise: exerciseValid ? { index: ex.paragraph - 1, criterionKey: ex.criterionKey, instruction: ex.instruction.trim() } : null,
  };
}

/* ── evolution ────────────────────────────────────────────────────── */

/**
 * Change per criterion between the first and the last corrected essays of a
 * window, as a share of the criterion's maximum. Needs 2 essays at least.
 */
export function criterionTrends(history: { scores: { key: string; name: string; score: number; maxScore: number }[] }[]) {
  if (history.length < 2) return [];
  const half = Math.max(1, Math.floor(history.length / 2));
  const early = history.slice(0, half);
  const late = history.slice(-half);
  const keys = new Map<string, string>();
  for (const h of history) for (const s of h.scores) keys.set(s.key, s.name);
  const avg = (list: typeof history, key: string) => {
    const vals = list.flatMap((h) => h.scores.filter((s) => s.key === key).map((s) => (s.maxScore ? s.score / s.maxScore : 0)));
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  };
  return [...keys]
    .map(([key, name]) => {
      const a = avg(early, key);
      const b = avg(late, key);
      return { key, name, from: a, to: b, delta: a !== null && b !== null ? b - a : null };
    })
    .filter((t) => t.delta !== null)
    .sort((x, y) => (y.delta ?? 0) - (x.delta ?? 0));
}

/**
 * Criteria that keep costing points: at or below `threshold` of the maximum in
 * at least `minHits` of the last `window` corrections (most recent last).
 */
export function recurringWeakCriteria(history: { scores: { key: string; name: string; score: number; maxScore: number }[] }[], threshold = 0.5, window = 3, minHits = 2) {
  const recent = history.slice(-window);
  const hits = new Map<string, { name: string; count: number }>();
  for (const h of recent) {
    for (const s of h.scores) {
      if (s.maxScore > 0 && s.score / s.maxScore <= threshold) {
        const e = hits.get(s.key) ?? { name: s.name, count: 0 };
        e.count++;
        hits.set(s.key, e);
      }
    }
  }
  return [...hits].filter(([, e]) => e.count >= minHits).map(([key, e]) => ({ key, name: e.name, hits: e.count }));
}
