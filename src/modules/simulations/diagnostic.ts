import "server-only";
import { db } from "@/lib/db";
import { planDiagnostic } from "@/engines/study/diagnostic";

/** What the diagnostic would look like for the student's main competition, and any earlier one. */
export async function getDiagnosticOffer(userId: string) {
  const primary = await db.studentCompetition.findFirst({
    where: { userId, isPrimary: true },
    select: {
      competition: {
        select: { id: true, name: true, forkedFromId: true, subjects: { select: { subjectId: true, weight: true, subject: { select: { name: true } } }, orderBy: { order: "asc" } } },
      },
    },
  });
  if (!primary) return null;
  const c = primary.competition;
  const sourceId = c.forkedFromId ?? c.id;
  const subjectIds = c.subjects.map((s) => s.subjectId);

  const [counts, existing] = await Promise.all([
    db.question.groupBy({
      by: ["subjectId"],
      where: {
        source: "OFFICIAL",
        subjectId: { in: subjectIds },
        OR: [{ competitionId: sourceId }, { topic: { competitions: { some: { competitionId: c.id } } } }],
        AND: [{ OR: [{ ownerId: null }, { ownerId: userId }] }],
      },
      _count: { _all: true },
    }),
    db.simulationAttempt.findFirst({
      where: { userId, simulation: { purpose: "DIAGNOSTIC" } },
      select: { id: true, status: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  const available = new Map(counts.map((r) => [r.subjectId, r._count._all]));
  const plan = planDiagnostic(c.subjects.map((s) => ({ subjectId: s.subjectId, weight: s.weight, available: available.get(s.subjectId) ?? 0 })));
  const names = new Map(c.subjects.map((s) => [s.subjectId, s.subject.name]));
  return {
    competitionId: c.id,
    competitionName: c.name,
    plan,
    split: Object.entries(plan.quotas).map(([id, n]) => ({ name: names.get(id) ?? "—", questions: n })),
    officialTotal: [...available.values()].reduce((a, n) => a + n, 0),
    existing,
  };
}
