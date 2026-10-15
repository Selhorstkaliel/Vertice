import "server-only";
import { db } from "@/lib/db";
import { dbDateToKey } from "@/lib/time";
import { competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { formatMeasure, summarizeTaf, type TafSummary } from "@/engines/military/taf";
import { planTafProgression, type ProgressionResult } from "@/engines/military/taf-progression";
import { MODALITY_LABEL } from "@/lib/labels";

export async function getMilitaryEnrollments(userId: string) {
  const rows = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" }, competition: { kind: "MILITARY" } },
    include: {
      competition: { select: { id: true, name: true, year: true, examDate: true, verification: true } },
      stages: { orderBy: { order: "asc" }, include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id,
    competitionId: e.competitionId,
    title: competitionTitle(e.competition, effectiveExamDate(e).date),
    isPrimary: e.isPrimary,
    verified: e.competition.verification === "VERIFIED",
    stages: e.stages.map((s) => ({ id: s.id, name: s.name, status: s.status, date: s.date ? dbDateToKey(s.date) : null, notes: s.notes, items: s.items.map(stageItemView) })),
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
  testDate: string | null;
  /** Where the date used by the progression came from. */
  testDateSource: "TEST" | "STAGE" | null;
  progression: ProgressionResult;
}

const isTafStage = (name: string) => {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return n.includes("taf") || n.includes("fisic");
};

export async function getTafTests(userId: string, today: string): Promise<TafTestView[]> {
  const tests = await db.militaryTest.findMany({
    where: { userId },
    include: {
      results: { orderBy: { recordedAt: "asc" } },
      enrollment: {
        select: { id: true, customExamDate: true, keepCustomExamDate: true, competition: { select: { name: true, year: true, examDate: true } }, stages: { select: { name: true, date: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return tests.map((t) => {
    const results = t.results.map((r) => ({ id: r.id, dateKey: dbDateToKey(r.recordedAt), value: r.value, label: formatMeasure(r.value, t.unit), notes: r.notes }));
    const stageDate = t.enrollment?.stages.find((s) => s.date && isTafStage(s.name))?.date ?? null;
    const testDate = t.testDate ? dbDateToKey(t.testDate) : stageDate ? dbDateToKey(stageDate) : null;
    const summary = summarizeTaf(results, t.betterWhen, t.targetValue);
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
      summary,
      testDate,
      testDateSource: t.testDate ? "TEST" : stageDate ? "STAGE" : null,
      progression: planTafProgression({ unit: t.unit, betterWhen: t.betterWhen, current: summary.latest?.value ?? null, target: t.targetValue, today, testDate }),
    };
  });
}

export function stageItemView(i: {
  id: string;
  title: string;
  kind: "DOCUMENT" | "HEALTH_EXAM" | "REGISTRATION_DEADLINE" | "APPEAL_DEADLINE" | "OTHER";
  dueDate: Date | null;
  doneAt: Date | null;
  catalogItemId: string | null;
  verification: "VERIFIED" | "UNVERIFIED" | "USER_PROVIDED";
  dateFromCatalog: boolean;
  sourceUrl: string | null;
  sourceYear: number | null;
  notes: string | null;
}) {
  return {
    id: i.id,
    title: i.title,
    kind: i.kind,
    dueDate: i.dueDate ? dbDateToKey(i.dueDate) : null,
    done: !!i.doneAt,
    custom: !i.catalogItemId,
    verified: i.verification === "VERIFIED",
    dateFromCatalog: i.dateFromCatalog,
    sourceUrl: i.sourceUrl,
    sourceYear: i.sourceYear,
    notes: i.notes,
  };
}
