import "server-only";
import { db } from "@/lib/db";
import { addDays, localNow } from "@/lib/time";
import { computeStreak } from "@/engines/performance/readiness";
import { evaluateAchievements, levelFor, longestStreak, type ProgressStats } from "@/engines/progress/achievements";
import { activeDayKeys } from "@/modules/performance/metrics";

/** All-time progress, level, streaks and personal milestones. Unlocks are stored once reached. */
export async function getProgress(userId: string, tz: string) {
  const today = localNow(tz).key;
  const [days, minutes, attempts, sessionQuestions, simulations, flashcardReviews, topicsStudied, goalsMet, tafResults, stored] = await Promise.all([
    activeDayKeys(userId, tz, 3650),
    db.studySession.aggregate({ where: { userId, status: "COMPLETED" }, _sum: { effectiveSeconds: true } }),
    db.questionAttempt.count({ where: { userId } }),
    db.studySession.aggregate({ where: { userId, status: "COMPLETED", questionsCount: { not: null } }, _sum: { questionsCount: true } }),
    db.simulationAttempt.count({ where: { userId, status: { in: ["FINISHED", "EXPIRED"] } } }),
    db.flashcardReview.count({ where: { userId } }),
    db.topicProgress.count({ where: { userId, status: { in: ["STUDIED", "REVIEWED"] } } }),
    db.goalCompletion.count({ where: { userId } }),
    db.militaryTestResult.count({ where: { userId } }),
    db.userAchievement.findMany({ where: { userId }, select: { key: true, unlockedAt: true } }),
  ]);

  const stats: ProgressStats = {
    studyMinutes: Math.round((minutes._sum.effectiveSeconds ?? 0) / 60),
    questions: attempts + (sessionQuestions._sum.questionsCount ?? 0),
    activeDays: days.size,
    bestStreak: longestStreak(days),
    simulations,
    flashcardReviews,
    topicsStudied,
    goalsMet,
    tafResults,
  };

  const states = evaluateAchievements(stats);
  const storedKeys = new Map(stored.map((s) => [s.key, s.unlockedAt]));
  const fresh = states.filter((s) => s.unlocked && !storedKeys.has(s.key));
  if (fresh.length) {
    const now = new Date();
    await db.userAchievement.createMany({ data: fresh.map((s) => ({ userId, key: s.key, unlockedAt: now })), skipDuplicates: true });
    for (const s of fresh) storedKeys.set(s.key, now);
  }

  const achievements = states.map((s) => ({ ...s, unlocked: s.unlocked || storedKeys.has(s.key), unlockedAt: storedKeys.get(s.key)?.toISOString() ?? null }));
  return {
    stats,
    level: levelFor(stats.studyMinutes),
    currentStreak: computeStreak(days, today, addDays),
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
  };
}

export type ProgressData = Awaited<ReturnType<typeof getProgress>>;
