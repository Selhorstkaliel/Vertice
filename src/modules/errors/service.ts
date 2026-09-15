import "server-only";
import type { ErrorReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { questionFigures } from "@/lib/question-content";

export const ERROR_PAGE_SIZE = 15;

export interface ErrorFilters {
  materia?: string;
  motivo?: string;
  situacao?: string;
  assunto?: string;
}

const REASONS = new Set(["DID_NOT_KNOW", "CONFUSED_CONCEPTS", "INTERPRETATION", "INATTENTION", "CALCULATION", "FORGOT_FORMULA", "GUESS", "OTHER"]);

function errorWhere(userId: string, f: ErrorFilters): Prisma.ErrorEntryWhereInput {
  const where: Prisma.ErrorEntryWhereInput = { userId };
  if (f.materia) where.subjectId = f.materia;
  if (f.assunto) where.topicId = f.assunto;
  if (f.motivo === "sem-motivo") where.reason = null;
  else if (f.motivo && REASONS.has(f.motivo)) where.reason = f.motivo as ErrorReason;
  if (f.situacao === "abertos") where.resolvedAt = null;
  else if (f.situacao === "revisados") where.resolvedAt = { not: null };
  return where;
}

export async function listErrors(userId: string, filters: ErrorFilters, page: number) {
  const where = errorWhere(userId, filters);
  const [total, rows] = await Promise.all([
    db.errorEntry.count({ where }),
    db.errorEntry.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        topic: { select: { id: true, name: true } },
        examBoard: { select: { name: true } },
        question: {
          select: {
            id: true,
            statement: true,
            figures: true,
            explanation: true,
            options: { select: { label: true, text: true, isCorrect: true }, orderBy: { order: "asc" } },
          },
        },
        flashcards: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ERROR_PAGE_SIZE,
      take: ERROR_PAGE_SIZE,
    }),
  ]);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / ERROR_PAGE_SIZE)),
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      reason: r.reason,
      reasonNote: r.reasonNote,
      note: r.note,
      subjectName: r.subject.name,
      topicId: r.topic?.id ?? null,
      topicName: r.topic?.name ?? null,
      boardName: r.examBoard?.name ?? null,
      questionId: r.question?.id ?? null,
      statement: r.question?.statement ?? null,
      figures: questionFigures(r.question?.figures),
      explanation: r.question?.explanation ?? null,
      selected: r.question?.options.find((o) => o.label === r.selectedLabel) ?? (r.selectedLabel ? { label: r.selectedLabel, text: "", isCorrect: false } : null),
      correct: r.question?.options.find((o) => o.isCorrect) ?? (r.correctLabel ? { label: r.correctLabel, text: "", isCorrect: true } : null),
      flashcardId: r.flashcards[0]?.id ?? null,
    })),
  };
}

export type ErrorItem = Awaited<ReturnType<typeof listErrors>>["items"][number];

/** §21 — error analysis that also feeds the Study Engine (recent unresolved errors raise topic priority). */
export async function errorAnalytics(userId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [byReason, byTopic, bySubject, total, open, recent] = await Promise.all([
    db.errorEntry.groupBy({ by: ["reason"], where: { userId }, _count: { _all: true } }),
    db.errorEntry.groupBy({
      by: ["topicId"],
      where: { userId, topicId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { topicId: "desc" } },
      take: 8,
    }),
    db.errorEntry.groupBy({ by: ["subjectId"], where: { userId, createdAt: { gte: since } }, _count: { _all: true } }),
    db.errorEntry.count({ where: { userId } }),
    db.errorEntry.count({ where: { userId, resolvedAt: null } }),
    db.errorEntry.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);

  const topicIds = byTopic.map((t) => t.topicId!).filter(Boolean);
  const subjectIds = bySubject.map((s) => s.subjectId);
  const [topics, subjects, progress] = await Promise.all([
    db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true, subject: { select: { name: true } } } }),
    db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
    db.topicProgress.findMany({ where: { userId, topicId: { in: topicIds } }, select: { topicId: true, questionsAnswered: true, questionsCorrect: true } }),
  ]);

  const classified = byReason.filter((r) => r.reason !== null).reduce((a, r) => a + r._count._all, 0);
  return {
    total,
    open,
    recent30: recent,
    classified,
    reasons: byReason
      .filter((r) => r.reason !== null)
      .map((r) => ({ reason: r.reason as ErrorReason, count: r._count._all, share: classified ? r._count._all / classified : 0 }))
      .sort((a, b) => b.count - a.count),
    unclassified: byReason.find((r) => r.reason === null)?._count._all ?? 0,
    topTopics: byTopic.map((t) => {
      const topic = topics.find((x) => x.id === t.topicId);
      const p = progress.find((x) => x.topicId === t.topicId);
      return {
        topicId: t.topicId!,
        name: topic?.name ?? "—",
        subjectName: topic?.subject.name ?? "",
        errors: t._count._all,
        accuracy: p && p.questionsAnswered >= 5 ? p.questionsCorrect / p.questionsAnswered : null,
      };
    }),
    bySubject: bySubject
      .map((s) => ({ subjectId: s.subjectId, name: subjects.find((x) => x.id === s.subjectId)?.name ?? "—", count: s._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
