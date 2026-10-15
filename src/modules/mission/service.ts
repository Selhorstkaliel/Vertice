import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { questionFigures } from "@/lib/question-content";
import { keyToDbDate, localNow } from "@/lib/time";
import { CONTENT_SOURCE_LABEL } from "@/lib/labels";
import { rankTopics } from "@/engines/study/priority";
import { buildDailyMission, MISSION_DURATIONS, type MissionDuration, type MissionPlan } from "@/engines/study/daily-mission";
import { loadStudyContext } from "@/modules/study-data/candidates";
import { getCardsByIds, getReviewQueue } from "@/modules/flashcards/service";

/** Snapshot stored in DailyMission.plan. */
const snapshotSchema = z.object({
  plan: z.custom<MissionPlan>((v) => !!v && typeof v === "object" && Array.isArray((v as MissionPlan).blocks)),
  topicQuestionIds: z.array(z.string()),
});
type Snapshot = z.infer<typeof snapshotSchema>;

export function normalizeMissionMinutes(value: number): MissionDuration {
  return (MISSION_DURATIONS as readonly number[]).includes(value) ? (value as MissionDuration) : 20;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The student's own pace, when there is enough of it; otherwise the engine defaults. */
async function studentPace(userId: string) {
  const [reviews, attempts] = await Promise.all([
    db.flashcardReview.findMany({ where: { userId, durationMs: { not: null } }, select: { durationMs: true }, orderBy: { reviewedAt: "desc" }, take: 100 }),
    db.questionAttempt.findMany({ where: { userId, timeSpentSec: { not: null } }, select: { timeSpentSec: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return {
    secondsPerCard: reviews.length >= 20 ? (median(reviews.map((r) => r.durationMs! / 1000)) ?? undefined) : undefined,
    secondsPerQuestion: attempts.length >= 20 ? (median(attempts.map((a) => a.timeSpentSec!)) ?? undefined) : undefined,
  };
}

/** Questions for the topic block: never answered first, official before the rest, then the subject as backup. */
async function drawTopicQuestions(userId: string, topicId: string, count: number) {
  if (count <= 0) return [];
  const topic = await db.topic.findUnique({ where: { id: topicId }, select: { subjectId: true } });
  if (!topic) return [];
  const visible = { OR: [{ ownerId: null }, { ownerId: userId }] };
  const select = { id: true, topicId: true, source: true, states: { where: { userId }, select: { attempts: true } } } satisfies Prisma.QuestionSelect;
  const [inTopic, inSubject] = await Promise.all([
    db.question.findMany({ where: { AND: [visible, { OR: [{ topicId }, { topic: { parentId: topicId } }] }] }, select, take: 300 }),
    db.question.findMany({ where: { AND: [visible, { subjectId: topic.subjectId }] }, select, take: 300 }),
  ]);
  const rank = (q: (typeof inTopic)[number]) => ((q.states[0]?.attempts ?? 0) > 0 ? 2 : 0) + (q.source === "OFFICIAL" ? 0 : 1) + Math.random() * 0.5;
  const ordered = [...inTopic.sort((a, b) => rank(a) - rank(b)), ...inSubject.sort((a, b) => rank(a) - rank(b))];
  return [...new Set(ordered.map((q) => q.id))].slice(0, count);
}

async function buildSnapshot(userId: string, tz: string, targetMinutes: number): Promise<Snapshot> {
  const today = localNow(tz).key;
  const [queue, errors, ctx, pace] = await Promise.all([
    getReviewQueue(userId, tz, {}, 200),
    db.errorEntry.findMany({
      where: { userId, resolvedAt: null, questionId: { not: null } },
      select: { id: true, questionId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 60,
    }),
    loadStudyContext(userId, tz, today),
    studentPace(userId),
  ]);
  // One entry per question: the same question wrong twice is redone once.
  const seen = new Set<string>();
  const uniqueErrors = errors.filter((e) => (seen.has(e.questionId!) ? false : (seen.add(e.questionId!), true)));
  const ranked = rankTopics(ctx.candidates);
  const top = ranked[0];

  const plan = buildDailyMission({
    targetMinutes,
    dueCardIds: queue.map((c) => c.id),
    errors: uniqueErrors.map((e) => ({ entryId: e.id, questionId: e.questionId!, ageDays: Math.floor((Date.now() - e.createdAt.getTime()) / 86_400_000) })),
    topics: ctx.candidates
      .filter((c) => c.progress)
      .map((c) => ({
        topicId: c.topicId,
        topicName: c.topicName,
        subjectName: c.subjectName,
        answered: c.progress!.questionsAnswered,
        correct: c.progress!.questionsCorrect,
        daysToReview: c.progress!.daysToReview,
      })),
    fallbackTopic: top ? { topicId: top.topicId, topicName: top.topicName, subjectName: top.subjectName, reason: `Maior prioridade do seu plano agora. ${top.summary}` } : null,
    ...pace,
  });

  const topicBlock = plan.blocks.find((b) => b.kind === "TOPIC");
  const topicQuestionIds = topicBlock && topicBlock.kind === "TOPIC" ? await drawTopicQuestions(userId, topicBlock.topicId, topicBlock.questions) : [];
  return { plan, topicQuestionIds };
}

export async function getOrCreateTodayMission(userId: string, tz: string, missionMinutes: number) {
  const today = localNow(tz).key;
  const date = keyToDbDate(today);
  const existing = await db.dailyMission.findUnique({ where: { userId_date: { userId, date } } });
  if (existing) return existing;
  const minutes = normalizeMissionMinutes(missionMinutes);
  const snapshot = await buildSnapshot(userId, tz, minutes);
  try {
    return await db.dailyMission.create({
      data: { userId, date, targetMinutes: minutes, plan: snapshot as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    // Two tabs opening the mission at once: keep the first one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return db.dailyMission.findUniqueOrThrow({ where: { userId_date: { userId, date } } });
    }
    throw err;
  }
}

function readSnapshot(value: unknown): Snapshot {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : { plan: { targetMinutes: 20, blocks: [], estSeconds: 0, leftOver: { cards: 0, errors: 0 } }, topicQuestionIds: [] };
}

async function playerQuestions(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.question.findMany({
    where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: {
      id: true,
      type: true,
      statement: true,
      figures: true,
      source: true,
      sourceReference: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
      options: { select: { id: true, label: true, text: true }, orderBy: { order: "asc" } },
      states: { where: { userId }, select: { favorite: true, reviewLater: true } },
      flashcards: { where: { userId }, select: { id: true }, take: 1 },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      id: q.id,
      type: q.type,
      statement: q.statement,
      figures: questionFigures(q.figures),
      options: q.options,
      favorite: q.states[0]?.favorite ?? false,
      reviewLater: q.states[0]?.reviewLater ?? false,
      flashcardId: q.flashcards[0]?.id ?? null,
      subjectName: q.subject.name,
      topicName: q.topic?.name ?? null,
      sourceLabel: q.source === "OFFICIAL" && q.sourceReference ? q.sourceReference : CONTENT_SOURCE_LABEL[q.source],
      generated: q.source === "GENERATED",
    }));
}

export type MissionQuestion = Awaited<ReturnType<typeof playerQuestions>>[number];

/**
 * What is left of today's mission. An item counts as done once the student
 * acted on it after the mission started: a card rated, a question answered.
 */
export async function getMissionView(userId: string, tz: string, missionMinutes: number) {
  const mission = await getOrCreateTodayMission(userId, tz, missionMinutes);
  const { plan, topicQuestionIds } = readSnapshot(mission.plan);
  const since = mission.createdAt;

  const cardIds = plan.blocks.flatMap((b) => (b.kind === "FLASHCARDS" ? b.cardIds : []));
  const entryIds = plan.blocks.flatMap((b) => (b.kind === "ERRORS" ? b.entryIds : []));
  const entries = entryIds.length
    ? await db.errorEntry.findMany({ where: { id: { in: entryIds }, userId }, select: { id: true, questionId: true } })
    : [];
  const entryQuestion = new Map(entries.filter((e) => e.questionId).map((e) => [e.id, e.questionId!]));
  const errorQuestionIds = entryIds.map((id) => entryQuestion.get(id)).filter((id): id is string => !!id);

  const [reviewed, answered] = await Promise.all([
    cardIds.length
      ? db.flashcardReview.findMany({ where: { userId, flashcardId: { in: cardIds }, reviewedAt: { gte: since } }, select: { flashcardId: true }, distinct: ["flashcardId"] })
      : [],
    errorQuestionIds.length || topicQuestionIds.length
      ? db.questionAttempt.findMany({
          where: { userId, questionId: { in: [...errorQuestionIds, ...topicQuestionIds] }, createdAt: { gte: since } },
          select: { questionId: true },
          distinct: ["questionId"],
        })
      : [],
  ]);
  const reviewedIds = new Set(reviewed.map((r) => r.flashcardId));
  const answeredIds = new Set(answered.map((a) => a.questionId));

  const pendingCardIds = cardIds.filter((id) => !reviewedIds.has(id));
  const pendingEntries = entryIds.filter((id) => entryQuestion.has(id) && !answeredIds.has(entryQuestion.get(id)!));
  const pendingTopicIds = topicQuestionIds.filter((id) => !answeredIds.has(id));

  const [cards, errorQuestions, topicQuestions] = await Promise.all([
    getCardsByIds(userId, pendingCardIds),
    playerQuestions(userId, pendingEntries.map((id) => entryQuestion.get(id)!)),
    playerQuestions(userId, pendingTopicIds),
  ]);
  const entryByQuestion = new Map(pendingEntries.map((id) => [entryQuestion.get(id)!, id]));

  // Items that vanished (card deleted, question removed) neither block nor count.
  const total = cardIds.length + entryQuestion.size + topicQuestionIds.length;
  const pending = cards.length + errorQuestions.length + topicQuestions.length;

  return {
    id: mission.id,
    targetMinutes: mission.targetMinutes,
    completedAt: mission.completedAt,
    plan,
    total,
    done: Math.max(0, total - pending),
    cards,
    errorQuestions: errorQuestions.map((q) => ({ ...q, entryId: entryByQuestion.get(q.id)! })),
    topicQuestions,
  };
}

export type MissionView = Awaited<ReturnType<typeof getMissionView>>;

/** Short summary for the dashboard, without building anything. */
export async function getTodayMissionSummary(userId: string, tz: string) {
  const mission = await db.dailyMission.findUnique({
    where: { userId_date: { userId, date: keyToDbDate(localNow(tz).key) } },
    select: { targetMinutes: true, completedAt: true, plan: true },
  });
  if (!mission) return null;
  const { plan } = readSnapshot(mission.plan);
  return { targetMinutes: mission.targetMinutes, estMinutes: Math.max(1, Math.round(plan.estSeconds / 60)), completed: !!mission.completedAt };
}

/** Whether the student already acted on today's mission (then its size is kept). */
export async function missionStarted(userId: string, missionId: string) {
  const m = await db.dailyMission.findFirst({ where: { id: missionId, userId }, select: { createdAt: true } });
  if (!m) return false;
  const [r, a] = await Promise.all([
    db.flashcardReview.count({ where: { userId, reviewedAt: { gte: m.createdAt } } }),
    db.questionAttempt.count({ where: { userId, createdAt: { gte: m.createdAt } } }),
  ]);
  return r + a > 0;
}
