import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, dbDateToKey, keyToDbDate, localNow, startOfWeek, type DateKey } from "@/lib/time";
import { clamp } from "@/lib/utils";
import { DEFAULT_TARGET_ACCURACY, rankTopics } from "@/engines/study/priority";
import { loadStudyContext } from "@/modules/study-data/candidates";
import { localRange, questionStats, studiedMinutes } from "./metrics";

export interface WeeklyReportData {
  weekStart: DateKey;
  final: boolean;
  minutes: number;
  plannedMinutes: number | null;
  questions: number;
  accuracy: number | null;
  topicsStudied: number;
  flashcardsReviewed: number;
  simulations: number;
  bestSubject: { name: string; accuracy: number; answered: number } | null;
  priority: { subjectName: string; topicName: string; accuracy: number | null } | null;
  suggestion: string | null;
}

export async function buildWeeklyReport(userId: string, tz: string, weekStart: DateKey): Promise<WeeklyReportData> {
  const weekEnd = addDays(weekStart, 7);
  const range = localRange(weekStart, weekEnd, tz);
  const final = weekEnd <= localNow(tz).key;

  const [minutes, stats, plan, flashcards, simulations, sessionTopics, attemptTopics, bySubject] = await Promise.all([
    studiedMinutes(userId, weekStart, weekEnd, tz),
    questionStats(userId, weekStart, weekEnd, tz),
    db.studyPlan.findUnique({
      where: { userId_weekStart: { userId, weekStart: keyToDbDate(weekStart) } },
      select: { items: { where: { status: { in: ["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED", "MISSED"] } }, select: { startMinute: true, endMinute: true } } },
    }),
    db.flashcardReview.count({ where: { userId, reviewedAt: range } }),
    db.simulationAttempt.count({ where: { userId, status: { in: ["FINISHED", "EXPIRED"] }, finishedAt: range } }),
    db.studySession.findMany({ where: { userId, status: "COMPLETED", startedAt: range, topicId: { not: null } }, select: { topicId: true }, distinct: ["topicId"] }),
    db.questionAttempt.findMany({ where: { userId, createdAt: range, question: { topicId: { not: null } } }, select: { question: { select: { topicId: true } } } }),
    db.$queryRaw<{ name: string; answered: bigint; correct: bigint }[]>`
      SELECT s.name, COUNT(*) AS answered, COUNT(*) FILTER (WHERE a."isCorrect") AS correct
        FROM "QuestionAttempt" a JOIN "Question" q ON q.id = a."questionId" JOIN "Subject" s ON s.id = q."subjectId"
       WHERE a."userId" = ${userId} AND a."createdAt" >= ${range.gte} AND a."createdAt" < ${range.lt}
       GROUP BY s.name`,
  ]);

  const topics = new Set([...sessionTopics.map((s) => s.topicId), ...attemptTopics.map((a) => a.question.topicId)].filter(Boolean));
  const measured = bySubject
    .map((s) => ({ name: s.name, answered: Number(s.answered), accuracy: Number(s.correct) / Number(s.answered) }))
    .filter((s) => s.answered >= 10)
    .sort((a, b) => b.accuracy - a.accuracy);

  // Priority and suggestion come from the Study Engine at the time the week closes, then stay frozen.
  const ranked = rankTopics((await loadStudyContext(userId, tz, localNow(tz).key)).candidates);
  const top = ranked[0];
  const weak = ranked.filter((t) => t.accuracy !== null && t.accuracy < DEFAULT_TARGET_ACCURACY).slice(0, 2);
  let suggestion: string | null = null;
  if (weak.length) {
    const sessions = clamp(weak.reduce((a, t) => a + Math.round((DEFAULT_TARGET_ACCURACY - (t.accuracy ?? 0)) * 10), 0), 1, 4);
    const names = weak.map((t) => t.topicName).join(" e ");
    suggestion = `Na próxima semana, aumente ${names} em aproximadamente ${sessions === 1 ? "uma sessão" : `${["", "", "duas", "três", "quatro"][sessions]} sessões`}.`;
  } else if (top) {
    suggestion = `Na próxima semana, avance em ${top.topicName} (${top.subjectName}), o tópico de maior prioridade no seu plano.`;
  }

  return {
    weekStart,
    final,
    minutes,
    plannedMinutes: plan ? plan.items.reduce((a, i) => a + i.endMinute - i.startMinute, 0) : null,
    questions: stats.answered,
    accuracy: stats.accuracy,
    topicsStudied: topics.size,
    flashcardsReviewed: flashcards,
    simulations,
    bestSubject: measured[0] ?? null,
    priority: top ? { subjectName: top.subjectName, topicName: top.topicName, accuracy: top.accuracy } : null,
    suggestion,
  };
}

/** Last closed week's report, stored once so it never changes afterwards. */
export async function getLastWeeklyReport(userId: string, tz: string): Promise<WeeklyReportData | null> {
  const lastWeek = addDays(startOfWeek(localNow(tz).key), -7);
  const stored = await db.weeklyReport.findUnique({ where: { userId_weekStart: { userId, weekStart: keyToDbDate(lastWeek) } } });
  if (stored) return stored.data as unknown as WeeklyReportData;
  const report = await buildWeeklyReport(userId, tz, lastWeek);
  if (report.minutes === 0 && report.questions === 0 && report.flashcardsReviewed === 0) return null;
  await db.weeklyReport
    .create({ data: { userId, weekStart: keyToDbDate(lastWeek), data: report as unknown as Prisma.InputJsonValue } })
    .catch(() => undefined);
  return report;
}

export async function listWeeklyReports(userId: string, limit = 8) {
  const rows = await db.weeklyReport.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: limit });
  return rows.map((r) => ({ weekStart: dbDateToKey(r.weekStart), data: r.data as unknown as WeeklyReportData }));
}
