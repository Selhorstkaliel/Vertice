import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, dbDateToKey, keyToDbDate, localNow, startOfWeek, type DateKey } from "@/lib/time";
import { formatDayKey, formatMinutes, formatPercent, plural } from "@/lib/format";
import { ERROR_REASON_LABEL } from "@/lib/labels";
import { localRange } from "./metrics";

export interface WeekPoint {
  weekStart: DateKey;
  label: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  executedMinutes: number;
  plannedMinutes: number | null;
}

/** Local-week bucket (Monday start) of a UTC timestamp column, computed in SQL. */
const weekOf = (tz: string, column: Prisma.Sql) => Prisma.sql`(date_trunc('week', timezone(${tz}, timezone('UTC', ${column}))))::date`;

export async function weeklySeries(userId: string, tz: string, weeks: number): Promise<WeekPoint[]> {
  const today = localNow(tz).key;
  const firstWeek = addDays(startOfWeek(today), -7 * (weeks - 1));
  const since = localRange(firstWeek, addDays(today, 1), tz).gte;

  const [attempts, sessionQuestions, minutes, plans] = await Promise.all([
    db.$queryRaw<{ w: Date; answered: bigint; correct: bigint }[]>(Prisma.sql`
      SELECT ${weekOf(tz, Prisma.sql`"createdAt"`)} AS w, COUNT(*) AS answered, COUNT(*) FILTER (WHERE "isCorrect") AS correct
        FROM "QuestionAttempt" WHERE "userId" = ${userId} AND "createdAt" >= ${since} GROUP BY 1`),
    db.$queryRaw<{ w: Date; answered: bigint | null; correct: bigint | null }[]>(Prisma.sql`
      SELECT ${weekOf(tz, Prisma.sql`"startedAt"`)} AS w, SUM("questionsCount") AS answered, SUM("questionsCorrect") AS correct
        FROM "StudySession" WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "startedAt" >= ${since} AND "questionsCount" IS NOT NULL GROUP BY 1`),
    db.$queryRaw<{ w: Date; seconds: bigint }[]>(Prisma.sql`
      SELECT ${weekOf(tz, Prisma.sql`"startedAt"`)} AS w, SUM("effectiveSeconds") AS seconds
        FROM "StudySession" WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "startedAt" >= ${since} GROUP BY 1`),
    db.studyPlan.findMany({
      where: { userId, weekStart: { gte: keyToDbDate(firstWeek) } },
      select: { weekStart: true, items: { where: { status: { in: ["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED", "MISSED"] } }, select: { startMinute: true, endMinute: true } } },
    }),
  ]);

  const key = (d: Date) => dbDateToKey(d);
  return Array.from({ length: weeks }, (_, i) => addDays(firstWeek, 7 * i)).map((w) => {
    const a = attempts.find((x) => key(x.w) === w);
    const s = sessionQuestions.find((x) => key(x.w) === w);
    const answered = Number(a?.answered ?? 0) + Number(s?.answered ?? 0);
    const correct = Number(a?.correct ?? 0) + Number(s?.correct ?? 0);
    const plan = plans.find((p) => dbDateToKey(p.weekStart) === w);
    return {
      weekStart: w,
      label: formatDayKey(w, "dayMonth"),
      answered,
      correct,
      accuracy: answered >= 10 ? correct / answered : null,
      executedMinutes: Math.round(Number(minutes.find((x) => key(x.w) === w)?.seconds ?? 0) / 60),
      plannedMinutes: plan ? plan.items.reduce((acc, it) => acc + it.endMinute - it.startMinute, 0) : null,
    };
  });
}

export async function subjectAccuracy(userId: string, tz: string, weeks: number) {
  const since = localRange(addDays(startOfWeek(localNow(tz).key), -7 * (weeks - 1)), addDays(localNow(tz).key, 1), tz).gte;
  const rows = await db.$queryRaw<{ subjectId: string; name: string; answered: bigint; correct: bigint }[]>(Prisma.sql`
    SELECT q."subjectId", s.name, COUNT(*) AS answered, COUNT(*) FILTER (WHERE a."isCorrect") AS correct
      FROM "QuestionAttempt" a
      JOIN "Question" q ON q.id = a."questionId"
      JOIN "Subject" s ON s.id = q."subjectId"
     WHERE a."userId" = ${userId} AND a."createdAt" >= ${since}
     GROUP BY q."subjectId", s.name`);
  return rows
    .map((r) => ({ subjectId: r.subjectId, name: r.name, answered: Number(r.answered), correct: Number(r.correct) }))
    .map((r) => ({ ...r, accuracy: r.answered ? r.correct / r.answered : 0 }))
    .sort((a, b) => b.answered - a.answered);
}

export async function weakestTopics(userId: string, limit = 8) {
  const rows = await db.topicProgress.findMany({
    where: { userId, questionsAnswered: { gte: 5 } },
    select: { questionsAnswered: true, questionsCorrect: true, lastReviewedAt: true, nextReviewAt: true, topic: { select: { id: true, name: true, subject: { select: { name: true } } } } },
  });
  return rows
    .map((r) => ({ id: r.topic.id, name: r.topic.name, subjectName: r.topic.subject.name, answered: r.questionsAnswered, accuracy: r.questionsCorrect / r.questionsAnswered, nextReviewAt: r.nextReviewAt }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
    .slice(0, limit);
}

/** Error reasons in the last `weeks` weeks (rolling), with the totals behind the shares. */
export async function errorReasonDistribution(userId: string, weeks = 4) {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000);
  const rows = await db.errorEntry.groupBy({ by: ["reason"], where: { userId, createdAt: { gte: since } }, _count: { _all: true } });
  const total = rows.reduce((a, r) => a + r._count._all, 0);
  const unclassified = rows.find((r) => r.reason === null)?._count._all ?? 0;
  const classified = total - unclassified;
  return {
    weeks,
    total,
    classified,
    unclassified,
    reasons: rows
      .filter((r) => r.reason !== null)
      .map((r) => ({ reason: r.reason!, label: ERROR_REASON_LABEL[r.reason!], count: r._count._all, share: classified ? r._count._all / classified : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function simulationSeries(userId: string) {
  const rows = await db.simulationAttempt.findMany({
    where: { userId, status: { in: ["FINISHED", "EXPIRED"] } },
    select: { id: true, score: true, finishedAt: true, correct: true, wrong: true, unanswered: true, simulation: { select: { title: true } } },
    orderBy: { finishedAt: "asc" },
    take: 30,
  });
  return rows.filter((r) => r.score !== null && r.finishedAt);
}

export async function readinessHistory(userId: string, competitionId: string | null) {
  if (!competitionId) return [];
  const rows = await db.performanceSnapshot.findMany({
    where: { userId, scopeKey: `competition:${competitionId}`, readiness: { not: null } },
    select: { date: true, readiness: true, coverage: true },
    orderBy: { date: "asc" },
    take: 120,
  });
  return rows.map((r) => ({ dateKey: dbDateToKey(r.date), label: formatDayKey(dbDateToKey(r.date), "dayMonth"), readiness: r.readiness!, coverage: r.coverage }));
}

export interface Insight {
  id: string;
  tone: "positive" | "warning" | "neutral";
  text: string;
  href?: string;
}

/**
 * Evidence-backed observations. Each insight only appears when the underlying
 * sample is large enough, and states the numbers it is based on.
 */
export async function buildInsights(userId: string, tz: string, series: WeekPoint[]): Promise<Insight[]> {
  const insights: Insight[] = [];
  const today = localNow(tz).key;
  const since = localRange(addDays(startOfWeek(today), -7 * 5), addDays(today, 1), tz).gte;

  // Subject trend over the last five weeks, from recorded attempts (§73).
  const bySubjectWeek = await db.$queryRaw<{ subjectId: string; name: string; w: Date; answered: bigint; correct: bigint }[]>(Prisma.sql`
    SELECT q."subjectId", s.name, ${weekOf(tz, Prisma.sql`a."createdAt"`)} AS w, COUNT(*) AS answered, COUNT(*) FILTER (WHERE a."isCorrect") AS correct
      FROM "QuestionAttempt" a JOIN "Question" q ON q.id = a."questionId" JOIN "Subject" s ON s.id = q."subjectId"
     WHERE a."userId" = ${userId} AND a."createdAt" >= ${since}
     GROUP BY 1, 2, 3`);
  const subjects = new Map<string, { name: string; weeks: { w: string; answered: number; correct: number }[] }>();
  for (const r of bySubjectWeek) {
    const e = subjects.get(r.subjectId) ?? { name: r.name, weeks: [] };
    e.weeks.push({ w: dbDateToKey(r.w), answered: Number(r.answered), correct: Number(r.correct) });
    subjects.set(r.subjectId, e);
  }
  const trends: { name: string; from: number; to: number; weeksSpan: number }[] = [];
  for (const [, s] of subjects) {
    const sorted = s.weeks.sort((a, b) => (a.w < b.w ? -1 : 1));
    const first = sorted[0];
    const recent = sorted.slice(-2);
    const recentAnswered = recent.reduce((a, x) => a + x.answered, 0);
    if (!first || sorted.length < 3 || first.answered < 10 || recentAnswered < 10 || recent.includes(first)) continue;
    const from = first.correct / first.answered;
    const to = recent.reduce((a, x) => a + x.correct, 0) / recentAnswered;
    const weeksSpan = Math.round((Date.parse(sorted.at(-1)!.w) - Date.parse(first.w)) / (7 * 86_400_000)) + 1;
    if (Math.abs(to - from) >= 0.08) trends.push({ name: s.name, from, to, weeksSpan });
  }
  trends.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  for (const t of trends.slice(0, 2)) {
    insights.push({
      id: `trend-${t.name}`,
      tone: t.to > t.from ? "positive" : "warning",
      text: `Seu desempenho em ${t.name} ${t.to > t.from ? "subiu" : "caiu"} de ${formatPercent(t.from)} para ${formatPercent(t.to)} nas últimas ${t.weeksSpan} semanas.`,
    });
  }

  // Plan adherence over completed weeks with a plan.
  const done = series.filter((w) => w.weekStart < startOfWeek(today) && w.plannedMinutes);
  const lastThree = done.slice(-3);
  if (lastThree.length >= 2) {
    const planned = lastThree.reduce((a, w) => a + (w.plannedMinutes ?? 0), 0);
    const executed = lastThree.reduce((a, w) => a + w.executedMinutes, 0);
    const rate = planned ? executed / planned : 0;
    insights.push({
      id: "adherence",
      tone: rate >= 0.8 ? "positive" : rate >= 0.6 ? "neutral" : "warning",
      text: `Nas últimas ${lastThree.length} semanas você executou ${formatMinutes(executed / lastThree.length)} por semana, ${formatPercent(rate)} do planejado.`,
      href: "/plano",
    });
  }

  // Dominant error reason.
  const reasons = await db.errorEntry.groupBy({ by: ["reason"], where: { userId, reason: { not: null }, createdAt: { gte: since } }, _count: { _all: true } });
  const totalReasons = reasons.reduce((a, r) => a + r._count._all, 0);
  const top = [...reasons].sort((a, b) => b._count._all - a._count._all)[0];
  if (top?.reason && totalReasons >= 10) {
    insights.push({
      id: "error-reason",
      tone: "neutral",
      text: `${formatPercent(top._count._all / totalReasons)} dos seus erros recentes foram classificados como “${ERROR_REASON_LABEL[top.reason]}” (${totalReasons} erros com motivo).`,
      href: `/caderno-de-erros?motivo=${top.reason}&situacao=todos`,
    });
  }

  // Studied topics without review for a long time.
  const staleThreshold = localRange(addDays(today, -14), addDays(today, 1), tz).gte;
  const stale = await db.topicProgress.findMany({
    where: {
      userId,
      status: { in: ["STUDIED", "REVIEWED"] },
      OR: [{ lastReviewedAt: { lt: staleThreshold } }, { lastReviewedAt: null, lastStudiedAt: { lt: staleThreshold } }],
    },
    select: { lastReviewedAt: true, lastStudiedAt: true, topic: { select: { id: true, name: true } } },
    orderBy: [{ lastReviewedAt: { sort: "asc", nulls: "first" } }],
    take: 1,
  });
  const staleTopic = stale[0];
  if (staleTopic) {
    const last = staleTopic.lastReviewedAt ?? staleTopic.lastStudiedAt!;
    const days = Math.floor((Date.now() - last.getTime()) / 86_400_000);
    insights.push({ id: "stale", tone: "warning", text: `Você não revisa ${staleTopic.topic.name} há ${days} dias.`, href: `/edital?topico=${staleTopic.topic.id}` });
  }

  // Simulations: last vs previous.
  const sims = await db.simulationAttempt.findMany({ where: { userId, status: { in: ["FINISHED", "EXPIRED"] } }, select: { score: true }, orderBy: { finishedAt: "desc" }, take: 2 });
  if (sims.length === 2 && sims[0]!.score !== null && sims[1]!.score !== null) {
    const delta = sims[0]!.score! - sims[1]!.score!;
    if (Math.abs(delta) >= 0.03) {
      insights.push({
        id: "simulations",
        tone: delta > 0 ? "positive" : "warning",
        text: `No último simulado você fez ${formatPercent(sims[0]!.score)}, ${Math.abs(Math.round(delta * 100))} pontos percentuais ${delta > 0 ? "acima" : "abaixo"} do anterior.`,
        href: "/simulados",
      });
    }
  }

  const answeredTotal = series.reduce((a, w) => a + w.answered, 0);
  if (insights.length === 0 && answeredTotal > 0) {
    insights.push({ id: "sample", tone: "neutral", text: `${plural(answeredTotal, "questão respondida", "questões respondidas")} no período. As tendências aparecem com pelo menos 10 questões por semana em uma disciplina.` });
  }
  return insights;
}
