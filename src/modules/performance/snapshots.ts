import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keyToDbDate, localNow } from "@/lib/time";
import { readinessFor } from "./metrics";

const lastRun = new Map<string, number>();
const MIN_INTERVAL_MS = 30 * 60_000;

/**
 * Records today's state (§73). Only today's row is ever written, so past days
 * keep what was true then and are never recalculated from current data.
 * Throttled per process; safe to call on every navigation via `after()`.
 */
export async function recordDailySnapshots(userId: string) {
  const now = Date.now();
  if (now - (lastRun.get(userId) ?? 0) < MIN_INTERVAL_MS) return;
  lastRun.set(userId, now);

  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  if (!profile) return;
  const tz = profile.timezone;
  const today = localNow(tz).key;
  const date = keyToDbDate(today);

  const [progress, minutes, enrollments, bySubject] = await Promise.all([
    db.topicProgress.aggregate({ where: { userId }, _sum: { questionsAnswered: true, questionsCorrect: true } }),
    db.studySession.aggregate({ where: { userId, status: "COMPLETED" }, _sum: { effectiveSeconds: true } }),
    db.studentCompetition.findMany({ where: { userId, status: "ACTIVE" }, select: { competitionId: true, competition: { select: { name: true } } } }),
    db.$queryRaw<{ subjectId: string; answered: bigint; correct: bigint; minutes: bigint }[]>`
      SELECT t."subjectId", SUM(tp."questionsAnswered") AS answered, SUM(tp."questionsCorrect") AS correct, SUM(tp."studiedMinutes") AS minutes
        FROM "TopicProgress" tp JOIN "Topic" t ON t.id = tp."topicId"
       WHERE tp."userId" = ${userId}
       GROUP BY t."subjectId"`,
  ]);

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const upsert = (scopeKey: string, data: Omit<Prisma.PerformanceSnapshotUncheckedCreateInput, "userId" | "date" | "scopeKey">) =>
    writes.push(
      db.performanceSnapshot.upsert({
        where: { userId_date_scopeKey: { userId, date, scopeKey } },
        update: data,
        create: { userId, date, scopeKey, ...data },
      }),
    );

  upsert("global", {
    questionsAnswered: progress._sum.questionsAnswered ?? 0,
    questionsCorrect: progress._sum.questionsCorrect ?? 0,
    studiedMinutes: Math.round((minutes._sum.effectiveSeconds ?? 0) / 60),
  });
  for (const s of bySubject) {
    upsert(`subject:${s.subjectId}`, {
      questionsAnswered: Number(s.answered),
      questionsCorrect: Number(s.correct),
      studiedMinutes: Number(s.minutes),
    });
  }
  for (const e of enrollments) {
    const { readiness, coverage } = await readinessFor(userId, { id: e.competitionId, name: e.competition.name }, tz, today);
    upsert(`competition:${e.competitionId}`, {
      coverage: coverage.coverage,
      readiness: readiness.value,
      breakdown: { components: readiness.components, strengths: readiness.strengths, gaps: readiness.gaps, engine: readiness.engineVersion } as unknown as Prisma.InputJsonValue,
    });
  }
  await db.$transaction(writes);
}
