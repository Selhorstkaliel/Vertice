import "server-only";
import { db } from "@/lib/db";
import { dbDateToKey } from "@/lib/time";
import { competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { formatMeasure, summarizeTaf, type TafSummary } from "@/engines/military/taf";
import { MODALITY_LABEL } from "@/lib/labels";

export async function getMilitaryEnrollments(userId: string) {
  const rows = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" }, competition: { kind: "MILITARY" } },
    include: {
      competition: { select: { id: true, name: true, year: true, examDate: true, verification: true } },
      stages: { orderBy: { order: "asc" } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id,
    competitionId: e.competitionId,
    title: competitionTitle(e.competition, effectiveExamDate(e).date),
    isPrimary: e.isPrimary,
    verified: e.competition.verification === "VERIFIED",
    stages: e.stages.map((s) => ({ id: s.id, name: s.name, status: s.status, date: s.date ? dbDateToKey(s.date) : null, notes: s.notes })),
  }));
}

export type MilitaryEnrollmentView = Awaited<ReturnType<typeof getMilitaryEnrollments>>[number];

export interface TafTestView {
  id: string;
  name: string;
  modality: keyof typeof MODALITY_LABEL;
  unit: "SECONDS" | "REPS" | "METERS" | "KILOGRAMS";
  betterWhen: "LOWER" | "HIGHER";
  distanceMeters: number | null;
  targetValue: number | null;
  notes: string | null;
  enrollmentId: string | null;
  enrollmentTitle: string | null;
  results: { id: string; dateKey: string; value: number; label: string; notes: string | null }[];
  summary: TafSummary;
}

export async function getTafTests(userId: string): Promise<TafTestView[]> {
  const tests = await db.militaryTest.findMany({
    where: { userId },
    include: {
      results: { orderBy: { recordedAt: "asc" } },
      enrollment: { select: { id: true, customExamDate: true, competition: { select: { name: true, year: true, examDate: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return tests.map((t) => {
    const results = t.results.map((r) => ({ id: r.id, dateKey: dbDateToKey(r.recordedAt), value: r.value, label: formatMeasure(r.value, t.unit), notes: r.notes }));
    return {
      id: t.id,
      name: t.name,
      modality: t.modality,
      unit: t.unit,
      betterWhen: t.betterWhen,
      distanceMeters: t.distanceMeters,
      targetValue: t.targetValue,
      notes: t.notes,
      enrollmentId: t.enrollment?.id ?? null,
      enrollmentTitle: t.enrollment ? competitionTitle(t.enrollment.competition, effectiveExamDate(t.enrollment).date) : null,
      results,
      summary: summarizeTaf(results, t.betterWhen, t.targetValue),
    };
  });
}
