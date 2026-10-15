import "server-only";
import { Prisma, type DayPeriod } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMinutes, plural } from "@/lib/format";
import { addDays, daysUntilDate, localNow, startOfWeek, zonedToUtc } from "@/lib/time";
import { DEFAULT_ENERGY } from "@/engines/routine/availability";
import { ENERGY_LEARNING_VERSION, learnEnergy, type PeriodPerformance } from "@/engines/adaptation/energy-learning";
import { checkGoalRealism } from "@/engines/adaptation/goal-realism";
import { competitionTitle, effectiveExamDate, getPrimaryEnrollment } from "@/modules/competitions/queries";
import { countDueFlashcards } from "@/modules/flashcards/service";
import { getWeekHistory } from "@/modules/routine/service";
import { studiedMinutes } from "@/modules/performance/metrics";
import { createGoalProposal } from "@/modules/recommendations/service";
import { notify, type NewNotification } from "@/modules/notifications/service";
import { listGoals, recordGoalCompletions } from "@/modules/goals/service";
import { getProgress } from "@/modules/progress/service";
import { goalTitle } from "@/modules/goals/format";
import { generateStageReminders } from "@/modules/military/stages";
import { generateEssayNotices } from "@/modules/essays/service";
import { essaysEnabled } from "@/lib/plan-limits";

/*
 * Daily adaptive pass (§27, §34, §48). Everything here is idempotent: learned
 * energy is recomputed from a fixed window, proposals and notices use dedupe
 * keys, and nothing changes the routine or plan without the student.
 */

const LEARNING_WINDOW_WEEKS = 8;
const EXAM_THRESHOLDS = [90, 60, 30, 15, 7, 3, 1];
const STALE_DAYS = 14;
const FLASHCARD_NOTICE_MIN = 10;

const lastRun = new Map<string, number>();
const MIN_INTERVAL_MS = 30 * 60_000;

const PERIOD_SQL = (tz: string, column: Prisma.Sql) => Prisma.sql`
  CASE WHEN extract(hour from timezone(${tz}, timezone('UTC', ${column}))) < 6 THEN 'DAWN'
       WHEN extract(hour from timezone(${tz}, timezone('UTC', ${column}))) < 12 THEN 'MORNING'
       WHEN extract(hour from timezone(${tz}, timezone('UTC', ${column}))) < 18 THEN 'AFTERNOON'
       ELSE 'EVENING' END`;

export async function periodPerformance(userId: string, tz: string, since: Date): Promise<PeriodPerformance[]> {
  const [attempts, sessions] = await Promise.all([
    db.$queryRaw<{ period: DayPeriod; answered: bigint; correct: bigint }[]>(Prisma.sql`
      SELECT ${PERIOD_SQL(tz, Prisma.sql`"createdAt"`)} AS period, COUNT(*) AS answered, COUNT(*) FILTER (WHERE "isCorrect") AS correct
        FROM "QuestionAttempt" WHERE "userId" = ${userId} AND "createdAt" >= ${since} GROUP BY 1`),
    db.$queryRaw<{ period: DayPeriod; answered: bigint | null; correct: bigint | null; rated: bigint; focus: bigint | null }[]>(Prisma.sql`
      SELECT ${PERIOD_SQL(tz, Prisma.sql`"startedAt"`)} AS period, SUM("questionsCount") AS answered, SUM("questionsCorrect") AS correct,
             COUNT(focus) AS rated, SUM(focus) AS focus
        FROM "StudySession" WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "startedAt" >= ${since} GROUP BY 1`),
  ]);
  return DEFAULT_ENERGY.map(({ period }) => {
    const a = attempts.find((x) => x.period === period);
    const s = sessions.find((x) => x.period === period);
    return {
      period,
      answered: Number(a?.answered ?? 0) + Number(s?.answered ?? 0),
      correct: Number(a?.correct ?? 0) + Number(s?.correct ?? 0),
      ratedSessions: Number(s?.rated ?? 0),
      focusSum: Number(s?.focus ?? 0),
    };
  });
}

/** Recomputes learned energy per period; returns the periods whose adjustment changed. */
export async function updateLearnedEnergy(userId: string, tz: string, now = new Date()) {
  const since = zonedToUtc(addDays(localNow(tz, now).key, -7 * LEARNING_WINDOW_WEEKS), 0, tz);
  const learned = learnEnergy(await periodPerformance(userId, tz, since));
  const rows = await db.energyPeriod.findMany({ where: { userId } });
  const changed: DayPeriod[] = [];

  for (const l of learned) {
    const row = rows.find((r) => r.period === l.period);
    const evidence = {
      version: ENERGY_LEARNING_VERSION,
      windowWeeks: LEARNING_WINDOW_WEEKS,
      answered: l.answered,
      accuracy: l.accuracy,
      overallAccuracy: l.overallAccuracy,
      ratedSessions: l.ratedSessions,
      focusAverage: l.focusAverage,
      overallFocus: l.overallFocus,
      reason: l.reason,
    };
    if (!row) {
      if (l.delta === 0) continue;
      const level = DEFAULT_ENERGY.find((d) => d.period === l.period)!.level;
      await db.energyPeriod.create({ data: { userId, period: l.period, level, learnedDelta: l.delta, learnedEvidence: evidence, learnedAt: now } });
      changed.push(l.period);
      continue;
    }
    if (row.learnedDelta !== l.delta) changed.push(l.period);
    await db.energyPeriod.update({ where: { id: row.id }, data: { learnedDelta: l.delta, learnedEvidence: evidence, learnedAt: now } });
  }
  return changed;
}

/** Proposes a realistic weekly goal after repeated misses, at most once a week. */
export async function proposeRealisticGoal(userId: string, tz: string, weeklyHoursTarget: number | null, now = new Date()) {
  if (!weeklyHoursTarget) return null;
  const weekStart = startOfWeek(localNow(tz, now).key);
  const history = await getWeekHistory(userId, weekStart, 4, tz);
  const suggestion = checkGoalRealism(Math.round(weeklyHoursTarget * 60), history);
  if (!suggestion) return null;

  const recent = await db.aiRecommendation.findFirst({
    where: { userId, kind: "GOAL_ADJUSTMENT", source: "ENGINE", OR: [{ status: "PENDING" }, { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }] },
    select: { id: true },
  });
  if (recent) return null;

  const rec = await createGoalProposal(
    userId,
    {
      title: "Ajustar a meta semanal à execução real",
      reason: suggestion.reason,
      evidence: { weeks: suggestion.weeks, averageMinutes: Math.round(suggestion.averageMinutes), targetMinutes: suggestion.targetMinutes },
      values: { weeklyHoursTarget: suggestion.suggestedMinutes / 60 },
    },
    "ENGINE",
  );
  await notify(userId, [
    {
      type: "RECOMMENDATION",
      title: "Sugestão de ajuste na meta semanal.",
      body: `Sua execução média foi de ${formatMinutes(suggestion.averageMinutes)} nas últimas semanas. Revise a sugestão.`,
      href: "/mentor",
      dedupeKey: `goal-realism:${weekStart}`,
    },
  ]);
  return rec.id;
}

export async function generateNotifications(userId: string, tz: string, weeklyHoursTarget: number | null, now = new Date()) {
  const local = localNow(tz, now);
  const today = local.key;
  const weekStart = startOfWeek(today);
  const notices: NewNotification[] = [];

  const [due, primary, weekMinutes] = await Promise.all([
    countDueFlashcards(userId, tz),
    getPrimaryEnrollment(userId),
    weeklyHoursTarget ? studiedMinutes(userId, weekStart, addDays(weekStart, 7), tz) : Promise.resolve(0),
  ]);

  if (due >= FLASHCARD_NOTICE_MIN) {
    notices.push({ type: "FLASHCARDS_DUE", title: `${plural(due, "flashcard precisa", "flashcards precisam")} de revisão.`, href: "/flashcards/revisar", dedupeKey: `flashcards:${today}` });
  }

  if (primary) {
    const exam = effectiveExamDate(primary);
    if (exam.date) {
      const days = daysUntilDate(exam.date, tz, now);
      const threshold = EXAM_THRESHOLDS.filter((t) => t >= days).sort((a, b) => a - b)[0];
      if (days >= 1 && threshold !== undefined) {
        const verified = exam.official && primary.competition.verification === "VERIFIED";
        notices.push({
          type: "EXAM_COUNTDOWN",
          title: `${days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`} para ${competitionTitle(primary.competition, exam.date)}.`,
          body: verified ? null : exam.official ? "Informação não verificada: confirme a data no edital oficial." : "Data informada por você, não oficial.",
          href: "/painel",
          dedupeKey: `exam:${primary.competitionId}:${threshold}`,
        });
      }
    }
  }

  const staleBefore = zonedToUtc(addDays(today, -STALE_DAYS), 0, tz);
  const stale = await db.topicProgress.findFirst({
    where: {
      userId,
      status: { in: ["STUDIED", "REVIEWED"] },
      OR: [{ lastReviewedAt: { lt: staleBefore } }, { lastReviewedAt: null, lastStudiedAt: { lt: staleBefore } }],
    },
    orderBy: [{ lastReviewedAt: { sort: "asc", nulls: "first" } }, { lastStudiedAt: "asc" }],
    select: { lastReviewedAt: true, lastStudiedAt: true, topic: { select: { id: true, name: true } } },
  });
  if (stale) {
    const last = stale.lastReviewedAt ?? stale.lastStudiedAt;
    if (last) {
      const days = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
      notices.push({ type: "TOPIC_STALE", title: `Você não revisa ${stale.topic.name} há ${days} dias.`, href: `/edital?topico=${stale.topic.id}`, dedupeKey: `stale:${stale.topic.id}:${weekStart}` });
    }
  }

  if (weeklyHoursTarget && weekMinutes >= weeklyHoursTarget * 60) {
    notices.push({
      type: "GOAL",
      title: "Meta semanal de estudo concluída.",
      body: `Você estudou ${formatMinutes(weekMinutes)} nesta semana; a meta é ${formatMinutes(weeklyHoursTarget * 60)}.`,
      href: "/desempenho",
      dedupeKey: `goal-week:${weekStart}`,
    });
  }

  const goals = await listGoals(userId, tz);
  await recordGoalCompletions(userId, goals);
  for (const goal of goals) {
    if (!goal.isActive || goal.status.pace !== "DONE") continue;
    notices.push({ type: "GOAL", title: "Meta concluída.", body: goalTitle(goal), href: "/metas", dedupeKey: `goal:${goal.id}:${goal.range.start}` });
  }

  const tomorrow = addDays(today, 1);
  const simulations = await db.calendarEvent.findMany({
    where: { userId, type: "SIMULATION", startsAt: { gte: zonedToUtc(tomorrow, 0, tz), lt: zonedToUtc(addDays(tomorrow, 1), 0, tz) } },
    select: { id: true, title: true },
  });
  for (const e of simulations) {
    notices.push({ type: "SIMULATION_SOON", title: `Seu simulado “${e.title}” é amanhã.`, href: "/calendario", dedupeKey: `simulation-soon:${e.id}` });
  }

  return notify(userId, notices);
}

/** Throttled per process; safe to call on every navigation via `after()`. */
export async function runDailyAdaptation(userId: string) {
  const now = Date.now();
  if (now - (lastRun.get(userId) ?? 0) < MIN_INTERVAL_MS) return;
  lastRun.set(userId, now);

  const profile = await db.profile.findUnique({
    where: { userId },
    select: { timezone: true, weeklyHoursTarget: true, energyLearning: true, dailyStudyLimitMin: true, user: { select: { isAdmin: true } } },
  });
  if (!profile) return;
  if (profile.energyLearning) await updateLearnedEnergy(userId, profile.timezone);
  await proposeRealisticGoal(userId, profile.timezone, profile.weeklyHoursTarget);
  await generateNotifications(userId, profile.timezone, profile.weeklyHoursTarget);
  await generateStageReminders(userId, profile.timezone);
  if (essaysEnabled(profile.user)) await generateEssayNotices({ id: userId, profile });
  // Stamps personal milestones close to when they were reached.
  await getProgress(userId, profile.timezone);
}
