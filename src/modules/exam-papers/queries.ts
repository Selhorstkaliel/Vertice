import "server-only";
import type { DraftOrigin, DraftStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { DraftOption } from "@/engines/questions/draft-check";
import type { PaperSection } from "@/engines/questions/answer-key";
import { paperKey, type DraftFigure, type DraftVerification, type StoredAnswerKey } from "./review-check";

export type DraftFilter = "pendentes" | "com-problemas" | "prontas" | "publicadas" | "rejeitadas" | "todas";

export const DRAFT_FILTERS: { value: DraftFilter; label: string }[] = [
  { value: "pendentes", label: "A revisar" },
  { value: "prontas", label: "Sem pendências" },
  { value: "com-problemas", label: "Com pendências" },
  { value: "publicadas", label: "Publicadas" },
  { value: "rejeitadas", label: "Rejeitadas" },
  { value: "todas", label: "Todas" },
];

export function parseDraftFilter(value: string | undefined): DraftFilter {
  return DRAFT_FILTERS.some((f) => f.value === value) ? (value as DraftFilter) : "pendentes";
}

function filterWhere(filter: DraftFilter): Prisma.QuestionDraftWhereInput {
  switch (filter) {
    case "pendentes":
      return { status: "PENDING" };
    case "prontas":
      return { status: "PENDING", issues: { isEmpty: true } };
    case "com-problemas":
      return { status: "PENDING", NOT: { issues: { isEmpty: true } } };
    case "publicadas":
      return { status: "APPROVED" };
    case "rejeitadas":
      return { status: "REJECTED" };
    default:
      return {};
  }
}

/** Catalog competitions with their exam papers, for the import form and list. */
export async function listExamPapers() {
  const [papers, counts, competitions] = await Promise.all([
    db.examPaper.findMany({
      orderBy: [{ competition: { name: "asc" } }, { year: "desc" }, { version: "asc" }],
      select: {
        id: true,
        title: true,
        year: true,
        version: true,
        status: true,
        statusNote: true,
        expectedCount: true,
        extractedUpTo: true,
        leaseUntil: true,
        sourceUrl: true,
        answerKeyPath: true,
        aiRequests: true,
        competition: { select: { name: true } },
      },
    }),
    db.questionDraft.groupBy({ by: ["examPaperId", "status"], where: { examPaperId: { not: null } }, _count: { _all: true } }),
    db.competition.findMany({ where: { ownerId: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
  ]);
  const count = (paperId: string, status: DraftStatus) => counts.find((c) => c.examPaperId === paperId && c.status === status)?._count._all ?? 0;
  const now = Date.now();
  return {
    competitions,
    papers: papers.map((p) => ({
      ...p,
      running: !!p.leaseUntil && p.leaseUntil.getTime() > now,
      pending: count(p.id, "PENDING"),
      approved: count(p.id, "APPROVED"),
      rejected: count(p.id, "REJECTED"),
    })),
  };
}

/** Subjects and topics a reviewer may choose for a competition's questions. */
export async function reviewCatalog(competitionId: string) {
  const links = await db.competitionSubject.findMany({
    where: { competitionId },
    orderBy: { order: "asc" },
    select: { subject: { select: { id: true, name: true, topics: { where: { ownerId: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true } } } } },
  });
  return links.map(({ subject }) => {
    const names = new Map(subject.topics.map((t) => [t.id, t.name]));
    return { id: subject.id, name: subject.name, topics: subject.topics.map((t) => ({ id: t.id, name: t.parentId ? `${names.get(t.parentId)} › ${t.name}` : t.name })) };
  });
}

export type ReviewCatalog = Awaited<ReturnType<typeof reviewCatalog>>;

export interface ReviewDraft {
  id: string;
  origin: DraftOrigin;
  status: DraftStatus;
  number: number | null;
  statement: string;
  options: DraftOption[];
  correctLabel: string | null;
  /** The official key decides the answer; the reviewer cannot change it. */
  keyLabel: string | null;
  explanation: string | null;
  subjectId: string | null;
  topicId: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | null;
  figures: DraftFigure[];
  issues: string[];
  verification: DraftVerification;
  aiModel: string;
  questionId: string | null;
  attempts: number;
  paperId: string | null;
  competitionId: string;
  competitionName: string;
  createdAt: Date;
}

const draftSelect = {
  id: true,
  origin: true,
  status: true,
  number: true,
  statement: true,
  options: true,
  correctLabel: true,
  explanation: true,
  subjectId: true,
  topicId: true,
  difficulty: true,
  figures: true,
  issues: true,
  verification: true,
  aiModel: true,
  questionId: true,
  examPaperId: true,
  competitionId: true,
  createdAt: true,
  competition: { select: { name: true } },
  question: { select: { _count: { select: { attempts: true } } } },
} satisfies Prisma.QuestionDraftSelect;

function toReviewDraft(d: Prisma.QuestionDraftGetPayload<{ select: typeof draftSelect }>, keyLabels: Map<number, string | null>): ReviewDraft {
  return {
    id: d.id,
    origin: d.origin,
    status: d.status,
    number: d.number,
    statement: d.statement,
    options: d.options as unknown as DraftOption[],
    correctLabel: d.correctLabel,
    keyLabel: d.number !== null && keyLabels.has(d.number) ? (keyLabels.get(d.number) ?? null) : null,
    explanation: d.explanation,
    subjectId: d.subjectId,
    topicId: d.topicId,
    difficulty: d.difficulty,
    figures: (d.figures as DraftFigure[] | null) ?? [],
    issues: d.issues,
    verification: (d.verification as DraftVerification | null) ?? {},
    aiModel: d.aiModel,
    questionId: d.questionId,
    attempts: d.question?._count.attempts ?? 0,
    paperId: d.examPaperId,
    competitionId: d.competitionId,
    competitionName: d.competition.name,
    createdAt: d.createdAt,
  };
}

export async function getPaperReview(paperId: string, filter: DraftFilter) {
  const paper = await db.examPaper.findUnique({ where: { id: paperId }, include: { competition: { select: { id: true, name: true } } } });
  if (!paper) return null;
  const [drafts, counts, catalog, pages] = await Promise.all([
    db.questionDraft.findMany({ where: { examPaperId: paperId, ...filterWhere(filter) }, orderBy: { number: "asc" }, select: draftSelect }),
    Promise.all(DRAFT_FILTERS.map(async (f) => [f.value, await db.questionDraft.count({ where: { examPaperId: paperId, ...filterWhere(f.value) } })] as const)),
    reviewCatalog(paper.competitionId),
    import("./pdf").then((m) => m.pdfPageCount(paper.filePath)).catch(() => null),
  ]);
  // The decided answer per number: correctLabel already reflects the key, so only mark which numbers the key covers.
  const key = paperKey(paper);
  const keyLabels = new Map<number, string | null>();
  if (key.entries) for (const d of drafts) if (d.number !== null && key.entries.some((e) => e.number === d.number)) keyLabels.set(d.number, d.correctLabel);
  const storedKey = paper.answerKey as StoredAnswerKey | null;
  return {
    paper: {
      id: paper.id,
      title: paper.title,
      year: paper.year,
      version: paper.version,
      status: paper.status,
      statusNote: paper.statusNote,
      expectedCount: paper.expectedCount,
      extractedUpTo: paper.extractedUpTo,
      running: !!paper.leaseUntil && paper.leaseUntil > new Date(),
      sourceUrl: paper.sourceUrl,
      answerKeyUrl: paper.answerKeyUrl,
      hasAnswerKey: !!paper.answerKeyPath,
      answerKeyKind: storedKey?.kind ?? null,
      keyNote: key.note,
      layout: (paper.layout as PaperSection[] | null) ?? [],
      aiRequests: paper.aiRequests,
      competition: paper.competition,
      pages,
    },
    drafts: drafts.map((d) => toReviewDraft(d, keyLabels)),
    counts: Object.fromEntries(counts) as Record<DraftFilter, number>,
    catalog,
  };
}

export async function getGeneratedReview(filter: DraftFilter, competitionId: string | null) {
  const where: Prisma.QuestionDraftWhereInput = { origin: "GENERATED", ...(competitionId ? { competitionId } : {}) };
  const [drafts, counts, competitions] = await Promise.all([
    db.questionDraft.findMany({ where: { ...where, ...filterWhere(filter) }, orderBy: { createdAt: "desc" }, take: 100, select: draftSelect }),
    Promise.all(DRAFT_FILTERS.map(async (f) => [f.value, await db.questionDraft.count({ where: { ...where, ...filterWhere(f.value) } })] as const)),
    db.competition.findMany({
      where: { ownerId: null },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { questions: { where: { source: "OFFICIAL" } } } } },
    }),
  ]);
  const catalogs = Object.fromEntries(await Promise.all(competitions.map(async (c) => [c.id, await reviewCatalog(c.id)] as const)));
  const officialBySubject = await db.question.groupBy({ by: ["competitionId", "subjectId"], where: { source: "OFFICIAL", ownerId: null }, _count: { _all: true } });
  return {
    drafts: drafts.map((d) => toReviewDraft(d, new Map())),
    counts: Object.fromEntries(counts) as Record<DraftFilter, number>,
    competitions: competitions.map((c) => ({
      id: c.id,
      name: c.name,
      officialCount: c._count.questions,
      subjects: (catalogs[c.id] ?? []).map((s) => ({ ...s, officialCount: officialBySubject.find((o) => o.competitionId === c.id && o.subjectId === s.id)?._count._all ?? 0 })),
    })),
    catalogs,
  };
}
