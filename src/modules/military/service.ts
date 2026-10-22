import "server-only";
import { db } from "@/lib/db";
import { dbDateToKey } from "@/lib/time";
import { competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { formatMeasure, summarizeTaf, type TafSummary } from "@/engines/military/taf";
import { planTafProgression, type ProgressionResult } from "@/engines/military/taf-progression";
import { MODALITY_LABEL } from "@/lib/labels";
import { onePerTest, standardsForSex } from "@/engines/military/taf-standards";

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
  /** The target is still the edital's official index (year, when known). */
  editalTarget: { year: number | null } | null;
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
      standard: { select: { target: true, year: true } },
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
      editalTarget: t.standard && t.standard.target === t.targetValue ? { year: t.standard.year } : null,
      progression: planTafProgression({ unit: t.unit, betterWhen: t.betterWhen, current: summary.latest?.value ?? null, target: t.targetValue, today, testDate }),
    };
  });
}

/**
 * The physical test indices of each military competition the student follows,
 * from its published edital, for the student's sex (all of them while the sex
 * is unknown). Competitions without a published TAF are listed as missing.
 */
export async function getTafStandards(userId: string, sex: "MALE" | "FEMALE" | null) {
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" }, competition: { kind: "MILITARY" } },
    select: { id: true, customExamDate: true, keepCustomExamDate: true, competition: { select: { id: true, forkedFromId: true, name: true, year: true, examDate: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const catalogIds = enrollments.map((e) => e.competition.forkedFromId ?? e.competition.id);
  const standards = await db.competitionTafStandard.findMany({ where: { competitionId: { in: catalogIds } }, orderBy: { order: "asc" } });
  return enrollments.map((e) => {
    const own = standards.filter((s) => s.competitionId === (e.competition.forkedFromId ?? e.competition.id));
    const shown = sex ? standardsForSex(own, sex) : own;
    return {
      enrollmentId: e.id,
      title: competitionTitle(e.competition, effectiveExamDate(e).date),
      year: own[0]?.year ?? null,
      sourceUrl: own[0]?.sourceUrl ?? null,
      standards: shown.map((s) => ({ id: s.id, test: s.test, sex: s.sex, ageRange: s.ageRange, index: s.index, unitText: s.unitText, measurable: !!s.unit })),
    };
  });
}

export type TafStandardsView = Awaited<ReturnType<typeof getTafStandards>>[number];

/**
 * Fills the student's TAF with the edital's tests and targets, once per index:
 * a test the student already has from that index is never duplicated or
 * overwritten (they may adjust the target). Needs the student's sex.
 */
export async function syncTafFromEdital(userId: string, sex: "MALE" | "FEMALE" | null) {
  if (!sex) return 0;
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" }, competition: { kind: "MILITARY" } },
    select: { id: true, competition: { select: { id: true, forkedFromId: true } } },
  });
  if (enrollments.length === 0) return 0;
  const standards = await db.competitionTafStandard.findMany({
    where: { competitionId: { in: enrollments.map((e) => e.competition.forkedFromId ?? e.competition.id) }, unit: { not: null }, betterWhen: { not: null } },
    orderBy: { order: "asc" },
  });
  const linked = new Set((await db.militaryTest.findMany({ where: { userId, standardId: { not: null } }, select: { standardId: true } })).map((t) => t.standardId));
  let created = 0;
  for (const e of enrollments) {
    const own = standards.filter((s) => s.competitionId === (e.competition.forkedFromId ?? e.competition.id));
    for (const s of onePerTest(standardsForSex(own, sex))) {
      if (linked.has(s.id)) continue;
      await db.militaryTest.create({
        data: {
          userId,
          studentCompetitionId: e.id,
          standardId: s.id,
          name: `${s.test}${s.ageRange ? ` (${s.ageRange})` : ""}`.slice(0, 60),
          modality: s.modality,
          unit: s.unit!,
          betterWhen: s.betterWhen!,
          distanceMeters: s.distanceMeters,
          targetValue: s.target,
          notes: `Índice do edital${s.year ? ` ${s.year}` : ""}: ${s.index} ${s.unitText}`.trim().slice(0, 300),
        },
      });
      created++;
    }
  }
  return created;
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
