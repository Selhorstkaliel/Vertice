import "server-only";
import { randomInt } from "node:crypto";
import type { Difficulty, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { explanationAuthorship, questionFigures } from "@/lib/question-content";
import { applyStudyToTopic } from "@/modules/syllabus/progress";

/** Grace period for answers sent right as the timer ends (network latency). */
export const DEADLINE_GRACE_MS = 5_000;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface SelectionCriteria {
  competitionId?: string | null;
  examBoardId?: string | null;
  subjectIds: string[];
  difficulty?: Difficulty | null;
  count: number;
  preferUnanswered: boolean;
}

/**
 * Draws questions spread evenly across the chosen subjects (round robin),
 * preferring questions the student has never answered when requested.
 */
export async function selectQuestions(userId: string, c: SelectionCriteria) {
  const where: Prisma.QuestionWhereInput = {
    AND: [
      { OR: [{ ownerId: null }, { ownerId: userId }] },
      { subjectId: { in: c.subjectIds } },
      c.examBoardId ? { examBoardId: c.examBoardId } : {},
      c.difficulty ? { difficulty: c.difficulty } : {},
      c.competitionId ? { OR: [{ competitionId: c.competitionId }, { topic: { competitions: { some: { competitionId: c.competitionId } } } }] } : {},
    ],
  };
  const pool = await db.question.findMany({
    where,
    select: { id: true, subjectId: true, states: { where: { userId }, select: { attempts: true } } },
  });

  const bySubject = new Map<string, { fresh: string[]; seen: string[] }>();
  for (const q of pool) {
    const entry = bySubject.get(q.subjectId) ?? { fresh: [], seen: [] };
    if ((q.states[0]?.attempts ?? 0) === 0) entry.fresh.push(q.id);
    else entry.seen.push(q.id);
    bySubject.set(q.subjectId, entry);
  }
  const queues = [...bySubject.values()].map((e) => (c.preferUnanswered ? [...shuffle(e.fresh), ...shuffle(e.seen)] : shuffle([...e.fresh, ...e.seen])));

  const picked: string[] = [];
  let progressed = true;
  while (picked.length < c.count && progressed) {
    progressed = false;
    for (const q of shuffle(queues)) {
      const id = q.shift();
      if (id) {
        picked.push(id);
        progressed = true;
        if (picked.length >= c.count) break;
      }
    }
  }
  return { questionIds: shuffle(picked), available: pool.length };
}

export async function listSimulations(userId: string) {
  return db.simulation.findMany({
    where: { userId },
    include: {
      competition: { select: { name: true } },
      examBoard: { select: { name: true } },
      subjects: { select: { subject: { select: { name: true } } } },
      attempts: { orderBy: { startedAt: "desc" }, select: { id: true, status: true, score: true, correct: true, startedAt: true, finishedAt: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAttemptForTaking(userId: string, attemptId: string) {
  const attempt = await db.simulationAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      simulation: {
        select: {
          id: true,
          title: true,
          timeLimitMinutes: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              question: {
                select: {
                  id: true,
                  type: true,
                  statement: true,
                  figures: true,
                  subject: { select: { name: true } },
                  // Never select isCorrect here: this payload goes to the browser.
                  options: { select: { id: true, label: true, text: true }, orderBy: { order: "asc" } },
                },
              },
            },
          },
        },
      },
      answers: { select: { simulationQuestionId: true, selectedOptionId: true, flagged: true } },
    },
  });
  return attempt;
}

/**
 * Scores an attempt and records it like regular practice: question attempts,
 * topic progress and error-notebook entries. Idempotent.
 */
export async function finalizeAttempt(userId: string, attemptId: string, tz: string, now = new Date()) {
  const attempt = await db.simulationAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      simulation: {
        include: {
          questions: { include: { question: { include: { options: true } } }, orderBy: { order: "asc" } },
        },
      },
      answers: true,
    },
  });
  if (!attempt) return null;
  if (attempt.status !== "IN_PROGRESS") return attempt.id;

  const expired = !!attempt.deadlineAt && now.getTime() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS;
  const endedAt = expired && attempt.deadlineAt ? attempt.deadlineAt : now;
  const answers = new Map(attempt.answers.map((a) => [a.simulationQuestionId, a]));

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  await db.$transaction(async (tx) => {
    for (const sq of attempt.simulation.questions) {
      const q = sq.question;
      const answer = answers.get(sq.id);
      const selected = answer?.selectedOptionId ? q.options.find((o) => o.id === answer.selectedOptionId) : undefined;
      const right = q.options.find((o) => o.isCorrect);
      if (!selected) {
        unanswered++;
        continue;
      }
      const isCorrect = selected.isCorrect;
      if (isCorrect) correct++;
      else wrong++;

      await tx.simulationAnswer.update({ where: { id: answer!.id }, data: { isCorrect } });
      const qa = await tx.questionAttempt.create({
        data: {
          userId,
          questionId: q.id,
          selectedOptionId: selected.id,
          isCorrect,
          context: "SIMULATION",
          simulationAttemptId: attempt.id,
          createdAt: answer?.answeredAt ?? endedAt,
        },
      });
      await tx.userQuestionState.upsert({
        where: { userId_questionId: { userId, questionId: q.id } },
        update: { attempts: { increment: 1 }, lastCorrect: isCorrect, lastAttemptAt: endedAt },
        create: { userId, questionId: q.id, attempts: 1, lastCorrect: isCorrect, lastAttemptAt: endedAt },
      });
      if (q.topicId) {
        await applyStudyToTopic(tx, {
          userId,
          topicId: q.topicId,
          minutes: 0,
          kind: "QUESTIONS",
          contentCompleted: false,
          questions: { answered: 1, correct: isCorrect ? 1 : 0 },
          at: endedAt,
          tz,
        });
      }
      if (!isCorrect) {
        await tx.errorEntry.create({
          data: {
            userId,
            questionId: q.id,
            attemptId: qa.id,
            subjectId: q.subjectId,
            topicId: q.topicId,
            competitionId: attempt.simulation.competitionId ?? q.competitionId,
            examBoardId: q.examBoardId,
            selectedLabel: selected.label,
            correctLabel: right?.label ?? null,
          },
        });
      }
    }

    const total = attempt.simulation.questions.length;
    await tx.simulationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: expired ? "EXPIRED" : "FINISHED",
        finishedAt: endedAt,
        correct,
        wrong,
        unanswered,
        score: total ? correct / total : 0,
        durationSec: Math.max(0, Math.round((endedAt.getTime() - attempt.startedAt.getTime()) / 1000)),
      },
    });
  });

  return attempt.id;
}

export async function getAttemptResult(userId: string, attemptId: string) {
  const attempt = await db.simulationAttempt.findFirst({
    where: { id: attemptId, userId, status: { in: ["FINISHED", "EXPIRED"] } },
    include: {
      simulation: {
        include: {
          competition: { select: { id: true, name: true, subjects: { select: { subjectId: true, weight: true } } } },
          examBoard: { select: { name: true } },
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: {
                select: {
                  id: true,
                  type: true,
                  statement: true,
                  figures: true,
                  source: true,
                  aiModel: true,
                  explanation: true,
                  subjectId: true,
                  topicId: true,
                  subject: { select: { name: true } },
                  topic: { select: { name: true } },
                  options: { select: { id: true, label: true, text: true, isCorrect: true }, orderBy: { order: "asc" } },
                },
              },
            },
          },
        },
      },
      answers: true,
    },
  });
  if (!attempt) return null;

  const answers = new Map(attempt.answers.map((a) => [a.simulationQuestionId, a]));
  const bySubject = new Map<string, { name: string; total: number; correct: number; wrong: number; unanswered: number; weight: number | null }>();
  const byTopic = new Map<string, { name: string; subjectName: string; total: number; correct: number; wrong: number }>();
  const weights = new Map(attempt.simulation.competition?.subjects.map((s) => [s.subjectId, s.weight]) ?? []);

  const review = attempt.simulation.questions.map((sq, index) => {
    const q = sq.question;
    const a = answers.get(sq.id);
    const selected = a?.selectedOptionId ?? null;
    const isCorrect = selected ? (q.options.find((o) => o.id === selected)?.isCorrect ?? false) : null;

    const s = bySubject.get(q.subjectId) ?? { name: q.subject.name, total: 0, correct: 0, wrong: 0, unanswered: 0, weight: weights.get(q.subjectId) ?? null };
    s.total++;
    if (isCorrect === true) s.correct++;
    else if (isCorrect === false) s.wrong++;
    else s.unanswered++;
    bySubject.set(q.subjectId, s);

    if (q.topicId && q.topic) {
      const t = byTopic.get(q.topicId) ?? { name: q.topic.name, subjectName: q.subject.name, total: 0, correct: 0, wrong: 0 };
      t.total++;
      if (isCorrect === true) t.correct++;
      else t.wrong++;
      byTopic.set(q.topicId, t);
    }

    return {
      number: index + 1,
      questionId: q.id,
      type: q.type,
      statement: q.statement,
      figures: questionFigures(q.figures),
      explanation: q.explanation,
      explanationNote: q.explanation ? explanationAuthorship(q.source, q.aiModel) : null,
      subjectName: q.subject.name,
      topicName: q.topic?.name ?? null,
      options: q.options,
      selectedOptionId: selected,
      flagged: a?.flagged ?? false,
      isCorrect,
    };
  });

  const subjects = [...bySubject.entries()]
    .map(([id, s]) => ({ id, ...s, accuracy: s.total ? s.correct / s.total : 0, lost: s.wrong + s.unanswered }))
    .sort((a, b) => b.total - a.total);

  // "Maior perda de pontos": most questions lost, weighted by the subject weight only when confirmed.
  const allWeighted = subjects.every((s) => s.weight !== null);
  const biggestLoss = [...subjects].sort((a, b) => (allWeighted ? b.lost * (b.weight ?? 1) - a.lost * (a.weight ?? 1) : b.lost - a.lost) || a.accuracy - b.accuracy)[0] ?? null;

  const topics = [...byTopic.entries()].map(([id, t]) => ({ id, ...t, accuracy: t.total ? t.correct / t.total : 0 }));
  const priorityTopic = [...topics].filter((t) => t.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)[0] ?? null;

  const previous = await db.simulationAttempt.findMany({
    where: {
      userId,
      id: { not: attempt.id },
      status: { in: ["FINISHED", "EXPIRED"] },
      finishedAt: { lt: attempt.finishedAt ?? new Date() },
      OR: [{ simulationId: attempt.simulationId }, ...(attempt.simulation.competitionId ? [{ simulation: { competitionId: attempt.simulation.competitionId } }] : [])],
    },
    select: { id: true, score: true, finishedAt: true, simulation: { select: { title: true } }, correct: true, wrong: true, unanswered: true },
    orderBy: { finishedAt: "desc" },
    take: 5,
  });

  return { attempt, review, subjects, topics, biggestLoss: biggestLoss && biggestLoss.lost > 0 ? { ...biggestLoss, weighted: allWeighted } : null, priorityTopic, previous };
}
