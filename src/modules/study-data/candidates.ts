import "server-only";
import { db } from "@/lib/db";
import { dbDateToKey, diffDays, toDateKey, type DateKey } from "@/lib/time";
import type { TopicCandidate } from "@/engines/study/priority";
import { effectiveExamDate, weightShares } from "@/modules/competitions/queries";

export interface StudyContext {
  enrollments: {
    id: string;
    competitionId: string;
    competitionName: string;
    isPrimary: boolean;
    daysToExam: number | null;
  }[];
  candidates: TopicCandidate[];
  /** All edital topic ids (including parents) per competition. */
  topicIdsByCompetition: Map<string, Set<string>>;
  leafTopicIds: Set<string>;
}

/**
 * Loads everything the Study Engine needs, for all active enrollments.
 * Topics shared by several competitions become a single candidate carrying
 * every competition link — study counts once, for all of them.
 */
export async function loadStudyContext(userId: string, tz: string, today: DateKey): Promise<StudyContext> {
  const [enrollments, profile] = await Promise.all([
    db.studentCompetition.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        competition: {
          select: {
            id: true,
            name: true,
            examDate: true,
            subjects: { select: { subjectId: true, weight: true } },
            topics: { select: { topicId: true, incidence: true } },
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
    db.profile.findUnique({ where: { userId }, select: { hardSubjects: { select: { id: true } } } }),
  ]);

  const topicIdsByCompetition = new Map<string, Set<string>>();
  const allTopicIds = new Set<string>();
  for (const e of enrollments) {
    const ids = new Set(e.competition.topics.map((t) => t.topicId));
    topicIdsByCompetition.set(e.competitionId, ids);
    ids.forEach((id) => allTopicIds.add(id));
  }

  const enrollmentInfo = enrollments.map((e) => {
    const exam = effectiveExamDate(e);
    return {
      id: e.id,
      competitionId: e.competitionId,
      competitionName: e.competition.name,
      isPrimary: e.isPrimary,
      daysToExam: exam.date ? diffDays(today, dbDateToKey(exam.date)) : null,
    };
  });

  if (allTopicIds.size === 0) {
    return { enrollments: enrollmentInfo, candidates: [], topicIdsByCompetition, leafTopicIds: new Set() };
  }

  const topics = await db.topic.findMany({
    where: { id: { in: [...allTopicIds] } },
    select: {
      id: true,
      name: true,
      parentId: true,
      subjectId: true,
      parent: { select: { name: true } },
      subject: { select: { name: true, area: true } },
    },
  });

  const parents = new Set(topics.map((t) => t.parentId).filter((id): id is string => !!id));
  const leaves = topics.filter((t) => !parents.has(t.id));
  const leafIds = leaves.map((t) => t.id);

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [progress, errors] = await Promise.all([
    db.topicProgress.findMany({ where: { userId, topicId: { in: leafIds } } }),
    db.errorEntry.groupBy({
      by: ["topicId"],
      where: { userId, createdAt: { gte: since }, topicId: { in: leafIds }, resolvedAt: null },
      _count: { _all: true },
    }),
  ]);
  const progressByTopic = new Map(progress.map((p) => [p.topicId, p]));
  const errorsByTopic = new Map(errors.map((e) => [e.topicId, e._count._all]));
  const hard = new Set(profile?.hardSubjects.map((s) => s.id) ?? []);

  const sharesByCompetition = new Map(enrollments.map((e) => [e.competitionId, weightShares(e.competition.subjects)]));
  const incidenceByCompetition = new Map(
    enrollments.map((e) => [e.competitionId, new Map(e.competition.topics.map((t) => [t.topicId, t.incidence]))]),
  );

  const candidates: TopicCandidate[] = leaves.map((t) => {
    const p = progressByTopic.get(t.id);
    const links = enrollmentInfo
      .filter((e) => topicIdsByCompetition.get(e.competitionId)?.has(t.id))
      .map((e) => ({
        competitionId: e.competitionId,
        competitionName: e.competitionName,
        isPrimary: e.isPrimary,
        weightShare: sharesByCompetition.get(e.competitionId)?.get(t.subjectId) ?? null,
        incidence: incidenceByCompetition.get(e.competitionId)?.get(t.id) ?? null,
        daysToExam: e.daysToExam,
      }));
    return {
      topicId: t.id,
      topicName: t.name,
      subjectId: t.subjectId,
      subjectName: t.subject.name,
      subjectArea: t.subject.area,
      parentName: t.parent?.name ?? null,
      competitions: links,
      hardSubject: hard.has(t.subjectId),
      recentErrors: errorsByTopic.get(t.id) ?? 0,
      progress: p
        ? {
            status: p.status,
            questionsAnswered: p.questionsAnswered,
            questionsCorrect: p.questionsCorrect,
            studiedMinutes: p.studiedMinutes,
            daysSinceStudied: p.lastStudiedAt ? diffDays(toDateKey(p.lastStudiedAt, tz), today) : null,
            daysToReview: p.nextReviewAt ? diffDays(today, toDateKey(p.nextReviewAt, tz)) : null,
          }
        : null,
    };
  });

  return { enrollments: enrollmentInfo, candidates, topicIdsByCompetition, leafTopicIds: new Set(leafIds) };
}
