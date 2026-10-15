import "server-only";
import { db } from "@/lib/db";
import { addDays, daysUntilDate, keyToDbDate, localNow, startOfWeek, toDateKey, zonedToUtc } from "@/lib/time";
import { rankTopics, subjectPriorities } from "@/engines/study/priority";
import type { CurrentUser } from "@/modules/auth/session";
import { competitionTitle, effectiveExamDate, getPrimaryEnrollment } from "@/modules/competitions/queries";
import { loadStudyContext } from "@/modules/study-data/candidates";
import { getItemsForDay } from "@/modules/plan/queries";
import { markMissedItems } from "@/modules/plan/service";
import { questionStats, readinessFor, streakFor, studiedMinutes } from "@/modules/performance/metrics";
import { countDueFlashcards } from "@/modules/flashcards/service";
import { getTodayMissionSummary } from "@/modules/mission/service";

export async function getDashboard(user: CurrentUser & { profile: NonNullable<CurrentUser["profile"]> }) {
  const tz = user.profile.timezone;
  const local = localNow(tz);
  const today = local.key;
  const weekStart = startOfWeek(today);
  const endOfToday = zonedToUtc(addDays(today, 1), 0, tz);

  await markMissedItems(user.id, tz);

  const [primary, todayItems, minutesToday, minutesWeek, weekQuestions, monthQuestions, flashDue, reviewsDue, streak, plan, pendingRecs, mission] =
    await Promise.all([
      getPrimaryEnrollment(user.id),
      getItemsForDay(user.id, tz, today),
      studiedMinutes(user.id, today, addDays(today, 1), tz),
      studiedMinutes(user.id, weekStart, addDays(weekStart, 7), tz),
      questionStats(user.id, weekStart, addDays(weekStart, 7), tz),
      questionStats(user.id, addDays(today, -29), addDays(today, 1), tz),
      countDueFlashcards(user.id, tz),
      db.topicProgress.count({ where: { userId: user.id, nextReviewAt: { lt: endOfToday } } }),
      streakFor(user.id, tz, today),
      db.studyPlan.findUnique({
        where: { userId_weekStart: { userId: user.id, weekStart: keyToDbDate(weekStart) } },
        select: { id: true, recommendedMinutes: true },
      }),
      db.aiRecommendation.count({ where: { userId: user.id, status: "PENDING" } }),
      getTodayMissionSummary(user.id, tz),
    ]);

  const ctx = await loadStudyContext(user.id, tz, today);
  const ranked = rankTopics(ctx.candidates);
  const priorities = subjectPriorities(ranked);
  const top = priorities[0] ?? null;

  let exam: {
    title: string;
    competitionId: string;
    date: Date | null;
    official: boolean;
    daysLeft: number | null;
    startedAt: Date;
  } | null = null;
  let readiness: Awaited<ReturnType<typeof readinessFor>> | null = null;

  if (primary) {
    const e = effectiveExamDate(primary);
    exam = {
      title: competitionTitle(primary.competition, e.date),
      competitionId: primary.competitionId,
      date: e.date,
      official: e.official,
      daysLeft: e.date ? daysUntilDate(e.date, tz) : null,
      startedAt: primary.createdAt,
    };
    readiness = await readinessFor(user.id, { id: primary.competitionId, name: primary.competition.name }, tz, today);
  }

  const prepElapsed =
    exam?.date && exam.daysLeft !== null
      ? (() => {
          const total = daysUntilDate(exam.date, tz, exam.startedAt);
          const elapsed = total - exam.daysLeft;
          return total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 1;
        })()
      : null;

  return {
    hour: local.hour,
    today,
    weekStart,
    exam,
    prepElapsed,
    todayItems,
    hasPlan: !!plan,
    metrics: {
      minutesToday,
      minutesWeek,
      weeklyTargetMinutes: user.profile.weeklyHoursTarget ? Math.round(user.profile.weeklyHoursTarget * 60) : null,
      recommendedMinutes: plan?.recommendedMinutes ?? null,
      weekQuestions: weekQuestions.answered,
      accuracy30: monthQuestions.accuracy,
      answered30: monthQuestions.answered,
      flashDue,
      reviewsDue,
      streak,
      coverage: readiness?.coverage.topicsTotal ? readiness.coverage.coverage : null,
    },
    readiness: readiness?.readiness ?? null,
    coverageBySubject: readiness?.coverage.bySubject ?? [],
    priority: top
      ? {
          subjectName: top.subjectName,
          topicName: top.topTopic.topicName,
          topicId: top.topTopic.topicId,
          subjectAccuracy: top.accuracy,
          topicAccuracy: top.topTopic.accuracy,
          answered: top.answered,
          reasons: top.topTopic.reasons.filter((r) => r.code !== "WEIGHT_UNCONFIRMED").slice(0, 3),
          weightUnconfirmed: top.topTopic.reasons.some((r) => r.code === "WEIGHT_UNCONFIRMED"),
          next: priorities.slice(1, 4).map((p) => ({ subjectName: p.subjectName, topicName: p.topTopic.topicName, accuracy: p.accuracy })),
        }
      : null,
    enrollmentsActive: ctx.enrollments.length,
    mission: mission ?? { targetMinutes: user.profile.missionMinutes, estMinutes: user.profile.missionMinutes, completed: false },
    pendingRecommendations: pendingRecs,
    dayKeyOfTomorrow: toDateKey(new Date(Date.now() + 86_400_000), tz),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
