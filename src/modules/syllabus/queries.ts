import "server-only";
import type { TopicStatus, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { weightShares } from "@/modules/competitions/queries";

export interface TopicNode {
  id: string;
  name: string;
  isLeaf: boolean;
  owned: boolean;
  status: TopicStatus;
  derived: boolean;
  answered: number;
  correct: number;
  accuracy: number | null;
  studiedMinutes: number;
  flashcards: number;
  errors: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  children: TopicNode[];
}

export interface SubjectNode {
  id: string;
  name: string;
  weight: number | null;
  weightShare: number | null;
  questionCount: number | null;
  verification: VerificationStatus;
  coverage: number;
  leafCount: number;
  studiedCount: number;
  answered: number;
  correct: number;
  topics: TopicNode[];
}

export async function getEditalTree(userId: string, competitionId: string) {
  const competition = await db.competition.findFirst({
    where: { id: competitionId, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: {
      id: true,
      name: true,
      ownerId: true,
      verification: true,
      sourceNote: true,
      subjects: {
        select: { subjectId: true, weight: true, questionCount: true, verification: true, subject: { select: { name: true } } },
        orderBy: { order: "asc" },
      },
      topics: {
        select: { topic: { select: { id: true, name: true, parentId: true, subjectId: true, order: true, ownerId: true } } },
      },
    },
  });
  if (!competition) return null;

  const topics = competition.topics.map((t) => t.topic);
  const ids = topics.map((t) => t.id);
  const [progress, flashcards, errors] = await Promise.all([
    db.topicProgress.findMany({ where: { userId, topicId: { in: ids } } }),
    db.flashcard.groupBy({ by: ["topicId"], where: { userId, topicId: { in: ids } }, _count: { _all: true } }),
    db.errorEntry.groupBy({ by: ["topicId"], where: { userId, topicId: { in: ids } }, _count: { _all: true } }),
  ]);
  const progressBy = new Map(progress.map((p) => [p.topicId, p]));
  const flashBy = new Map(flashcards.map((f) => [f.topicId, f._count._all]));
  const errorsBy = new Map(errors.map((e) => [e.topicId, e._count._all]));
  const idSet = new Set(ids);
  const childrenOf = new Map<string | null, typeof topics>();
  for (const t of topics) {
    const parent = t.parentId && idSet.has(t.parentId) ? t.parentId : null;
    const key = `${t.subjectId}:${parent ?? "root"}`;
    const list = childrenOf.get(key) ?? [];
    list.push(t);
    childrenOf.set(key, list);
  }

  const rank: Record<TopicStatus, number> = { NOT_STUDIED: 0, IN_PROGRESS: 1, STUDIED: 2, REVIEWED: 3 };

  function build(t: (typeof topics)[number]): TopicNode {
    const kids = (childrenOf.get(`${t.subjectId}:${t.id}`) ?? []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(build);
    const p = progressBy.get(t.id);
    if (kids.length === 0) {
      const answered = p?.questionsAnswered ?? 0;
      const correct = p?.questionsCorrect ?? 0;
      return {
        id: t.id,
        name: t.name,
        isLeaf: true,
        owned: t.ownerId === userId,
        status: p?.status ?? "NOT_STUDIED",
        derived: false,
        answered,
        correct,
        accuracy: answered >= 5 ? correct / answered : null,
        studiedMinutes: p?.studiedMinutes ?? 0,
        flashcards: flashBy.get(t.id) ?? 0,
        errors: errorsBy.get(t.id) ?? 0,
        lastReviewedAt: p?.lastReviewedAt ?? null,
        nextReviewAt: p?.nextReviewAt ?? null,
        children: [],
      };
    }
    const answered = kids.reduce((a, k) => a + k.answered, 0);
    const correct = kids.reduce((a, k) => a + k.correct, 0);
    const minRank = Math.min(...kids.map((k) => rank[k.status]));
    const anyStarted = kids.some((k) => k.status !== "NOT_STUDIED");
    const status: TopicStatus = minRank >= 2 ? (minRank === 3 ? "REVIEWED" : "STUDIED") : anyStarted ? "IN_PROGRESS" : "NOT_STUDIED";
    const nextReviews = kids.map((k) => k.nextReviewAt).filter((d): d is Date => !!d);
    const lastReviews = kids.map((k) => k.lastReviewedAt).filter((d): d is Date => !!d);
    return {
      id: t.id,
      name: t.name,
      isLeaf: false,
      owned: t.ownerId === userId,
      status,
      derived: true,
      answered,
      correct,
      accuracy: answered >= 5 ? correct / answered : null,
      studiedMinutes: kids.reduce((a, k) => a + k.studiedMinutes, 0),
      flashcards: kids.reduce((a, k) => a + k.flashcards, 0) + (flashBy.get(t.id) ?? 0),
      errors: kids.reduce((a, k) => a + k.errors, 0) + (errorsBy.get(t.id) ?? 0),
      lastReviewedAt: lastReviews.length ? new Date(Math.max(...lastReviews.map((d) => d.getTime()))) : null,
      nextReviewAt: nextReviews.length ? new Date(Math.min(...nextReviews.map((d) => d.getTime()))) : null,
      children: kids,
    };
  }

  const shares = weightShares(competition.subjects);
  const subjects: SubjectNode[] = competition.subjects.map((s) => {
    const roots = (childrenOf.get(`${s.subjectId}:root`) ?? []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(build);
    const leaves: TopicNode[] = [];
    const collect = (n: TopicNode) => (n.isLeaf ? leaves.push(n) : n.children.forEach(collect));
    roots.forEach(collect);
    const studied = leaves.filter((l) => l.status === "STUDIED" || l.status === "REVIEWED").length;
    const inProgress = leaves.filter((l) => l.status === "IN_PROGRESS").length;
    return {
      id: s.subjectId,
      name: s.subject.name,
      weight: s.weight,
      weightShare: shares.get(s.subjectId) ?? null,
      questionCount: s.questionCount,
      verification: s.verification,
      coverage: leaves.length ? (studied + inProgress * 0.5) / leaves.length : 0,
      leafCount: leaves.length,
      studiedCount: studied,
      answered: leaves.reduce((a, l) => a + l.answered, 0),
      correct: leaves.reduce((a, l) => a + l.correct, 0),
      topics: roots,
    };
  });

  const withLeaves = subjects.filter((s) => s.leafCount > 0);
  const totalWeight = withLeaves.reduce((a, s) => a + (s.weightShare ?? 1), 0);
  const coverage = totalWeight ? withLeaves.reduce((a, s) => a + (s.weightShare ?? 1) * s.coverage, 0) / totalWeight : 0;

  return {
    competition: { id: competition.id, name: competition.name, editable: competition.ownerId === userId, verification: competition.verification, sourceNote: competition.sourceNote },
    subjects,
    coverage,
  };
}
