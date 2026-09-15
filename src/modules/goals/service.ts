import "server-only";
import type { Goal, GoalKind } from "@prisma/client";
import { db } from "@/lib/db";
import { keyToDbDate, localNow, toDateKey } from "@/lib/time";
import { goalStatus, periodRange, previousPeriod, type GoalStatus, type PeriodRange } from "@/engines/goals/goals";
import { localRange } from "@/modules/performance/metrics";

export const MAX_ACTIVE_GOALS = 12;

/** What each goal kind counts, stated to the student next to the progress. */
export const GOAL_KIND_MEASURE: Record<GoalKind, string> = {
  HOURS: "Tempo efetivo das sessões de estudo concluídas.",
  QUESTIONS: "Questões respondidas na plataforma e questões informadas ao concluir sessões.",
  TOPICS: "Tópicos marcados como estudados ou revisados no período.",
  FLASHCARDS: "Revisões de flashcards feitas no período.",
  SIMULATIONS: "Simulados finalizados no período.",
  REVIEWS: "Sessões de revisão concluídas no período.",
};

/** Kinds that can be restricted to a subject. */
export const SUBJECT_KINDS: GoalKind[] = ["HOURS", "QUESTIONS", "TOPICS", "FLASHCARDS", "REVIEWS"];

export async function measureGoal(userId: string, tz: string, goal: Pick<Goal, "kind" | "subjectId">, range: PeriodRange): Promise<number> {
  const when = localRange(range.start, range.end, tz);
  const subjectId = goal.subjectId ?? undefined;
  switch (goal.kind) {
    case "HOURS": {
      const agg = await db.studySession.aggregate({ where: { userId, status: "COMPLETED", startedAt: when, subjectId }, _sum: { effectiveSeconds: true } });
      return Math.round(((agg._sum.effectiveSeconds ?? 0) / 3600) * 10) / 10;
    }
    case "QUESTIONS": {
      const [attempts, sessions] = await Promise.all([
        db.questionAttempt.count({ where: { userId, createdAt: when, ...(subjectId ? { question: { subjectId } } : {}) } }),
        db.studySession.aggregate({ where: { userId, status: "COMPLETED", startedAt: when, subjectId, questionsCount: { not: null } }, _sum: { questionsCount: true } }),
      ]);
      return attempts + (sessions._sum.questionsCount ?? 0);
    }
    case "TOPICS":
      return db.topicProgress.count({ where: { userId, status: { in: ["STUDIED", "REVIEWED"] }, lastStudiedAt: when, ...(subjectId ? { topic: { subjectId } } : {}) } });
    case "FLASHCARDS":
      return db.flashcardReview.count({ where: { userId, reviewedAt: when, ...(subjectId ? { flashcard: { subjectId } } : {}) } });
    case "SIMULATIONS":
      return db.simulationAttempt.count({ where: { userId, status: { in: ["FINISHED", "EXPIRED"] }, finishedAt: when } });
    case "REVIEWS":
      return db.studySession.count({ where: { userId, status: "COMPLETED", kind: "REVIEW", startedAt: when, subjectId } });
  }
}

export interface GoalView {
  id: string;
  kind: GoalKind;
  period: Goal["period"];
  target: number;
  isActive: boolean;
  subjectId: string | null;
  subjectName: string | null;
  range: PeriodRange;
  value: number;
  status: GoalStatus;
  previous: { value: number; met: boolean } | null;
}

export async function listGoals(userId: string, tz: string): Promise<GoalView[]> {
  const today = localNow(tz).key;
  const goals = await db.goal.findMany({ where: { userId }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] });
  const subjectIds = [...new Set(goals.map((g) => g.subjectId).filter((id): id is string => !!id))];
  const subjects = subjectIds.length ? await db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }) : [];

  return Promise.all(
    goals.map(async (g) => {
      const range = periodRange(g.period, today);
      const [value, previousValue] = await Promise.all([
        measureGoal(userId, tz, g, range),
        g.isActive && toDateKey(g.createdAt, tz) < range.start ? measureGoal(userId, tz, g, previousPeriod(g.period, range)) : Promise.resolve(null),
      ]);
      return {
        id: g.id,
        kind: g.kind,
        period: g.period,
        target: g.target,
        isActive: g.isActive,
        subjectId: g.subjectId,
        subjectName: subjects.find((s) => s.id === g.subjectId)?.name ?? null,
        range,
        value,
        status: goalStatus(value, g.target, range, today),
        previous: previousValue === null ? null : { value: previousValue, met: previousValue >= g.target },
      };
    }),
  );
}

/** Stores reached periods so personal milestones survive later edits to the data. */
export async function recordGoalCompletions(userId: string, goals: GoalView[]) {
  const reached = goals.filter((g) => g.isActive && g.status.pace === "DONE");
  if (reached.length === 0) return 0;
  const { count } = await db.goalCompletion.createMany({
    data: reached.map((g) => ({ userId, goalId: g.id, periodStart: keyToDbDate(g.range.start), value: g.value })),
    skipDuplicates: true,
  });
  return count;
}
