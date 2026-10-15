import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, keyToDbDate, startOfWeek, zonedToUtc, type DateKey } from "@/lib/time";
import { computeReadiness, computeStreak, type ReadinessResult } from "@/engines/performance/readiness";
import { MIN_ANSWERS_FOR_ACCURACY } from "@/engines/study/priority";
import { weightShares } from "@/modules/competitions/queries";
import { getWeekHistory } from "@/modules/routine/service";

/** UTC instant range of local days [from, to). */
export function localRange(from: DateKey, toExclusive: DateKey, tz: string) {
  return { gte: zonedToUtc(from, 0, tz), lt: zonedToUtc(toExclusive, 0, tz) };
}

/** Minutes studied (completed sessions) within a local date range. */
export async function studiedMinutes(userId: string, from: DateKey, toExclusive: DateKey, tz: string) {
  const agg = await db.studySession.aggregate({
    where: { userId, status: "COMPLETED", startedAt: localRange(from, toExclusive, tz) },
    _sum: { effectiveSeconds: true },
  });
  return Math.round((agg._sum.effectiveSeconds ?? 0) / 60);
}

/**
 * Questions answered and correct in a range. Combines platform attempts with
 * questions the student reported in study sessions (off-platform practice).
 */
export async function questionStats(userId: string, from: DateKey, toExclusive: DateKey, tz: string) {
  const range = localRange(from, toExclusive, tz);
  const [attempts, correct, sessions] = await Promise.all([
    db.questionAttempt.count({ where: { userId, createdAt: range } }),
    db.questionAttempt.count({ where: { userId, createdAt: range, isCorrect: true } }),
    db.studySession.aggregate({
      where: { userId, status: "COMPLETED", startedAt: range, questionsCount: { not: null } },
      _sum: { questionsCount: true, questionsCorrect: true },
    }),
  ]);
  const answered = attempts + (sessions._sum.questionsCount ?? 0);
  const right = correct + (sessions._sum.questionsCorrect ?? 0);
  return { answered, correct: right, accuracy: answered >= 10 ? right / answered : null };
}

/** Local days with meaningful study activity (or a completed daily mission), for streaks and consistency. */
export async function activeDayKeys(userId: string, tz: string, days = 120): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.$queryRaw<{ d: Date }[]>(Prisma.sql`
    SELECT d FROM (
      SELECT (timezone(${tz}, timezone('UTC', "startedAt")))::date AS d
        FROM "StudySession"
       WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "startedAt" >= ${since}
       GROUP BY 1 HAVING SUM("effectiveSeconds") >= 600
      UNION
      SELECT (timezone(${tz}, timezone('UTC', "createdAt")))::date AS d
        FROM "QuestionAttempt"
       WHERE "userId" = ${userId} AND "createdAt" >= ${since}
       GROUP BY 1 HAVING COUNT(*) >= 5
      UNION
      SELECT (timezone(${tz}, timezone('UTC', "reviewedAt")))::date AS d
        FROM "FlashcardReview"
       WHERE "userId" = ${userId} AND "reviewedAt" >= ${since}
       GROUP BY 1 HAVING COUNT(*) >= 5
      UNION
      SELECT date AS d
        FROM "DailyMission"
       WHERE "userId" = ${userId} AND "completedAt" IS NOT NULL AND "completedAt" >= ${since}
    ) t
  `);
  return new Set(rows.map((r) => r.d.toISOString().slice(0, 10)));
}

export async function streakFor(userId: string, tz: string, today: DateKey) {
  return computeStreak(await activeDayKeys(userId, tz), today, addDays);
}

export interface CompetitionCoverage {
  coverage: number;
  topicsTotal: number;
  topicsNotStudied: number;
  bySubject: {
    subjectId: string;
    subjectName: string;
    weightShare: number | null;
    leafTopics: number;
    studied: number;
    inProgress: number;
    coverage: number;
    answered: number;
    correct: number;
    accuracy: number | null;
  }[];
}

/** Edital coverage and accuracy by subject for one competition (leaf topics only). */
export async function competitionCoverage(userId: string, competitionId: string): Promise<CompetitionCoverage> {
  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: {
      subjects: { select: { subjectId: true, weight: true, order: true, subject: { select: { name: true } } }, orderBy: { order: "asc" } },
      topics: { select: { topic: { select: { id: true, parentId: true, subjectId: true } } } },
    },
  });
  if (!competition) return { coverage: 0, topicsTotal: 0, topicsNotStudied: 0, bySubject: [] };

  const topics = competition.topics.map((t) => t.topic);
  const parents = new Set(topics.map((t) => t.parentId).filter(Boolean));
  const leaves = topics.filter((t) => !parents.has(t.id));
  const progress = await db.topicProgress.findMany({
    where: { userId, topicId: { in: leaves.map((l) => l.id) } },
    select: { topicId: true, status: true, questionsAnswered: true, questionsCorrect: true },
  });
  const byTopic = new Map(progress.map((p) => [p.topicId, p]));
  const shares = weightShares(competition.subjects);

  const bySubject = competition.subjects.map((s) => {
    const subjectLeaves = leaves.filter((l) => l.subjectId === s.subjectId);
    let studied = 0;
    let inProgress = 0;
    let answered = 0;
    let correct = 0;
    for (const l of subjectLeaves) {
      const p = byTopic.get(l.id);
      if (!p) continue;
      if (p.status === "STUDIED" || p.status === "REVIEWED") studied++;
      else if (p.status === "IN_PROGRESS") inProgress++;
      answered += p.questionsAnswered;
      correct += p.questionsCorrect;
    }
    const n = subjectLeaves.length;
    return {
      subjectId: s.subjectId,
      subjectName: s.subject.name,
      weightShare: shares.get(s.subjectId) ?? null,
      leafTopics: n,
      studied,
      inProgress,
      coverage: n ? (studied + inProgress * 0.5) / n : 0,
      answered,
      correct,
      accuracy: answered >= MIN_ANSWERS_FOR_ACCURACY ? correct / answered : null,
    };
  });

  const withTopics = bySubject.filter((s) => s.leafTopics > 0);
  const totalWeight = withTopics.reduce((a, s) => a + (s.weightShare ?? 1), 0);
  const coverage = totalWeight ? withTopics.reduce((a, s) => a + (s.weightShare ?? 1) * s.coverage, 0) / totalWeight : 0;
  const notStudied = leaves.filter((l) => {
    const p = byTopic.get(l.id);
    return !p || p.status === "NOT_STUDIED";
  }).length;

  return { coverage, topicsTotal: leaves.length, topicsNotStudied: notStudied, bySubject };
}

export async function readinessFor(
  userId: string,
  competition: { id: string; name: string },
  tz: string,
  today: DateKey,
): Promise<{ readiness: ReadinessResult; coverage: CompetitionCoverage }> {
  const coverage = await competitionCoverage(userId, competition.id);
  const leafIds = await db.competitionTopic.findMany({ where: { competitionId: competition.id }, select: { topicId: true } });
  const topicIds = leafIds.map((t) => t.topicId);

  const [answeredAgg, sims, reviewTopics, overdueTopics, cardReviews, cardLapses, history, recent, previous, critical] = await Promise.all([
    db.topicProgress.aggregate({ where: { userId, topicId: { in: topicIds } }, _sum: { questionsAnswered: true, questionsCorrect: true } }),
    db.simulationAttempt.findMany({
      where: { userId, status: { in: ["FINISHED", "EXPIRED"] }, simulation: { OR: [{ competitionId: competition.id }, { competitionId: null }] } },
      select: { score: true },
      orderBy: { finishedAt: "desc" },
      take: 3,
    }),
    db.topicProgress.count({ where: { userId, topicId: { in: topicIds }, nextReviewAt: { not: null } } }),
    db.topicProgress.count({
      where: { userId, topicId: { in: topicIds }, nextReviewAt: { lt: zonedToUtc(addDays(today, -2), 0, tz) } },
    }),
    db.flashcardReview.count({ where: { userId, stateBefore: "REVIEW", reviewedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    db.flashcardReview.count({
      where: { userId, stateBefore: "REVIEW", rating: "AGAIN", reviewedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    }),
    getWeekHistory(userId, startOfWeek(today), 4, tz),
    questionStats(userId, addDays(today, -13), addDays(today, 1), tz),
    questionStats(userId, addDays(today, -27), addDays(today, -13), tz),
    db.topicProgress.findMany({
      where: { userId, topicId: { in: topicIds }, questionsAnswered: { gte: 8 } },
      select: { questionsAnswered: true, questionsCorrect: true, topic: { select: { name: true } } },
    }),
  ]);

  const topicHealth = reviewTopics > 0 ? 1 - overdueTopics / reviewTopics : null;
  const cardHealth = cardReviews >= 20 ? 1 - cardLapses / cardReviews : null;
  const healthParts = [topicHealth, cardHealth].filter((v): v is number => v !== null);
  const reviewHealth = healthParts.length ? healthParts.reduce((a, b) => a + b, 0) / healthParts.length : null;

  const weeks = history.filter((h) => h.plannedMinutes > 0);
  const consistency = weeks.length ? weeks.reduce((a, h) => a + Math.min(1, h.executedMinutes / h.plannedMinutes), 0) / weeks.length : null;

  const trend =
    recent.answered >= 15 && previous.answered >= 15 && recent.accuracy !== null && previous.accuracy !== null
      ? recent.accuracy - previous.accuracy
      : null;

  const readiness = computeReadiness({
    competitionName: competition.name,
    coverage: coverage.coverage,
    topicsTotal: coverage.topicsTotal,
    topicsNotStudied: coverage.topicsNotStudied,
    answered: answeredAgg._sum.questionsAnswered ?? 0,
    correct: answeredAgg._sum.questionsCorrect ?? 0,
    simulationScores: sims.map((s) => s.score).filter((s): s is number => s !== null),
    reviewHealth,
    consistency,
    accuracyTrend: trend,
    subjects: coverage.bySubject.map((s) => ({ name: s.subjectName, accuracy: s.accuracy, answered: s.answered })),
    criticalTopics: critical
      .map((c) => ({ name: c.topic.name, accuracy: c.questionsCorrect / c.questionsAnswered }))
      .filter((c) => c.accuracy < 0.5)
      .sort((a, b) => a.accuracy - b.accuracy),
  });

  return { readiness, coverage };
}

export function weekRange(today: DateKey) {
  const start = startOfWeek(today);
  return { start, endExclusive: addDays(start, 7), startDb: keyToDbDate(start) };
}
