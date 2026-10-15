/**
 * Placement test offered at the end of onboarding (pure).
 *
 * Splits up to `target` official questions among the subjects of the main
 * competition: by the edital weight when every weight is confirmed, otherwise
 * by how many official questions each subject has in the bank (its incidence
 * in past papers). Largest-remainder rounding, never more than a subject has.
 */

export const DIAGNOSTIC_TARGET = 20;
/** Below this, the bank is too thin for a meaningful diagnostic. */
export const DIAGNOSTIC_MINIMUM = 5;
/** Below this, the diagnostic is offered in a reduced form, with a warning. */
export const DIAGNOSTIC_REDUCED_BELOW = 15;
export const DIAGNOSTIC_SECONDS_PER_QUESTION = 180;

export interface DiagnosticSubject {
  subjectId: string;
  weight: number | null;
  /** Official questions of the subject available in the bank. */
  available: number;
}

export interface DiagnosticPlan {
  status: "FULL" | "REDUCED" | "UNAVAILABLE";
  total: number;
  quotas: Record<string, number>;
  basis: "WEIGHT" | "INCIDENCE";
  suggestedMinutes: number;
}

export function planDiagnostic(subjects: DiagnosticSubject[], target = DIAGNOSTIC_TARGET): DiagnosticPlan {
  const usable = subjects.filter((s) => s.available > 0);
  const pool = usable.reduce((a, s) => a + s.available, 0);
  const total = Math.min(target, pool);
  const allWeighted = usable.length > 0 && usable.every((s) => s.weight !== null && s.weight > 0);
  const basis: DiagnosticPlan["basis"] = allWeighted ? "WEIGHT" : "INCIDENCE";
  if (total < DIAGNOSTIC_MINIMUM) return { status: "UNAVAILABLE", total: 0, quotas: {}, basis, suggestedMinutes: 0 };

  const share = (s: DiagnosticSubject) => (allWeighted ? s.weight! : s.available);
  const sumShare = usable.reduce((a, s) => a + share(s), 0);
  const quotas = new Map<string, number>();
  const remainders: { id: string; r: number }[] = [];
  for (const s of usable) {
    const exact = (share(s) / sumShare) * total;
    const q = Math.min(s.available, Math.floor(exact));
    quotas.set(s.subjectId, q);
    remainders.push({ id: s.subjectId, r: exact - Math.floor(exact) });
  }
  let left = total - [...quotas.values()].reduce((a, n) => a + n, 0);
  // Largest remainders first; then anyone with spare questions.
  const order = [...remainders.sort((a, b) => b.r - a.r).map((x) => x.id), ...usable.map((s) => s.subjectId)];
  for (let i = 0; left > 0 && i < order.length * (total + 1); i++) {
    const id = order[i % order.length]!;
    const s = usable.find((x) => x.subjectId === id)!;
    if (quotas.get(id)! < s.available) {
      quotas.set(id, quotas.get(id)! + 1);
      left--;
    }
  }

  return {
    status: total < DIAGNOSTIC_REDUCED_BELOW ? "REDUCED" : "FULL",
    total,
    quotas: Object.fromEntries([...quotas].filter(([, n]) => n > 0)),
    basis,
    suggestedMinutes: Math.round((total * DIAGNOSTIC_SECONDS_PER_QUESTION) / 60),
  };
}
