import "server-only";
import type { CompetitionKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { daysUntilDate } from "@/lib/time";

/** A competition is visible when it is in the public catalog or owned by the user. */
export function visibleCompetition(userId: string): Prisma.CompetitionWhereInput {
  return { OR: [{ ownerId: null }, { ownerId: userId }] };
}

export function visibleSubject(userId: string): Prisma.SubjectWhereInput {
  return { OR: [{ ownerId: null }, { ownerId: userId }] };
}

export function effectiveExamDate(enrollment: {
  customExamDate: Date | null;
  competition: { examDate: Date | null };
}): { date: Date | null; official: boolean } {
  if (enrollment.competition.examDate) return { date: enrollment.competition.examDate, official: true };
  return { date: enrollment.customExamDate, official: false };
}

export function competitionTitle(c: { name: string; year: number | null }, examDate?: Date | null) {
  const year = c.year ?? examDate?.getUTCFullYear() ?? null;
  return year && !c.name.includes(String(year)) ? `${c.name} ${year}` : c.name;
}

/** Normalizes subject weights so an equal split = 1; null when any weight is unconfirmed. */
export function weightShares(subjects: { subjectId: string; weight: number | null }[]) {
  const out = new Map<string, number | null>();
  const known = subjects.filter((s) => s.weight !== null && s.weight > 0);
  if (subjects.length === 0) return out;
  if (known.length !== subjects.length) {
    for (const s of subjects) out.set(s.subjectId, null);
    return out;
  }
  const mean = known.reduce((a, s) => a + (s.weight ?? 0), 0) / known.length;
  for (const s of subjects) out.set(s.subjectId, mean > 0 ? (s.weight ?? 0) / mean : null);
  return out;
}

const enrollmentInclude = {
  competition: {
    include: {
      examBoard: { select: { id: true, name: true } },
      subjects: { include: { subject: { select: { id: true, name: true, area: true } } }, orderBy: { order: "asc" } },
      _count: { select: { topics: true } },
    },
  },
  stages: { orderBy: { order: "asc" } },
} satisfies Prisma.StudentCompetitionInclude;

export type EnrollmentWithCompetition = Prisma.StudentCompetitionGetPayload<{ include: typeof enrollmentInclude }>;

export async function getEnrollments(userId: string, opts: { includeArchived?: boolean } = {}) {
  return db.studentCompetition.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
    include: enrollmentInclude,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function getPrimaryEnrollment(userId: string) {
  return db.studentCompetition.findFirst({
    where: { userId, isPrimary: true },
    include: enrollmentInclude,
  });
}

export function describeEnrollment(e: EnrollmentWithCompetition, tz: string) {
  const exam = effectiveExamDate(e);
  return {
    id: e.id,
    competitionId: e.competitionId,
    title: competitionTitle(e.competition, exam.date),
    examDate: exam.date,
    examDateOfficial: exam.official,
    daysLeft: exam.date ? daysUntilDate(exam.date, tz) : null,
    isPrimary: e.isPrimary,
  };
}

export async function listCatalog(userId: string, params: { q?: string; kind?: CompetitionKind | "ALL" } = {}) {
  const q = params.q?.trim();
  return db.competition.findMany({
    where: {
      AND: [
        visibleCompetition(userId),
        // Private copies made by customizing an edital are reached through the enrollment.
        { forkedFromId: null },
        params.kind && params.kind !== "ALL" ? { kind: params.kind } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { organization: { contains: q, mode: "insensitive" } },
                { position: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: {
      id: true,
      name: true,
      organization: true,
      position: true,
      kind: true,
      year: true,
      examDate: true,
      verification: true,
      ownerId: true,
      subjects: { select: { subject: { select: { id: true, name: true } } }, orderBy: { order: "asc" } },
      enrollments: { where: { userId }, select: { id: true, isPrimary: true } },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: 100,
  });
}

export async function getCompetitionForUser(userId: string, competitionId: string) {
  return db.competition.findFirst({
    where: { AND: [{ id: competitionId }, visibleCompetition(userId)] },
    include: {
      examBoard: true,
      stages: { orderBy: { order: "asc" } },
      subjects: {
        include: { subject: { select: { id: true, name: true, area: true, ownerId: true } } },
        orderBy: { order: "asc" },
      },
      enrollments: { where: { userId }, include: { stages: { orderBy: { order: "asc" } } } },
      forkedFrom: { select: { id: true, name: true } },
      _count: { select: { topics: true } },
    },
  });
}

export async function listExamBoards() {
  return db.examBoard.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
}
