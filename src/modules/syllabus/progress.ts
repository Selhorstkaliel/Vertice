import "server-only";
import type { PlanItemKind, Prisma, TopicStatus } from "@prisma/client";
import { nextTopicReviewDays } from "@/engines/review/spaced-repetition";
import { addDays, toDateKey, zonedToUtc } from "@/lib/time";

type Tx = Prisma.TransactionClient;

const STATUS_RANK: Record<TopicStatus, number> = { NOT_STUDIED: 0, IN_PROGRESS: 1, STUDIED: 2, REVIEWED: 3 };

function reviewDate(from: Date, days: number, tz: string) {
  // Reviews are due at the start of the local day.
  return zonedToUtc(addDays(toDateKey(from, tz), days), 0, tz);
}

/**
 * Applies a completed study activity to the user's progress on a topic.
 * Status only moves forward automatically; manual status changes are respected.
 */
export async function applyStudyToTopic(
  tx: Tx,
  params: {
    userId: string;
    topicId: string;
    minutes: number;
    kind: PlanItemKind;
    contentCompleted: boolean;
    questions?: { answered: number; correct: number };
    at: Date;
    tz: string;
  },
) {
  const current = await tx.topicProgress.findUnique({ where: { userId_topicId: { userId: params.userId, topicId: params.topicId } } });
  const answered = (current?.questionsAnswered ?? 0) + (params.questions?.answered ?? 0);
  const correct = (current?.questionsCorrect ?? 0) + (params.questions?.correct ?? 0);
  const accuracy = answered >= 5 ? correct / answered : null;

  let status: TopicStatus = current?.status ?? "NOT_STUDIED";
  let reviewCount = current?.reviewCount ?? 0;
  let nextReviewAt = current?.nextReviewAt ?? null;
  let lastReviewedAt = current?.lastReviewedAt ?? null;

  const isReview = params.kind === "REVIEW";
  if (isReview && STATUS_RANK[status] >= STATUS_RANK.STUDIED) {
    reviewCount += 1;
    status = "REVIEWED";
    lastReviewedAt = params.at;
    nextReviewAt = reviewDate(params.at, nextTopicReviewDays(reviewCount, accuracy), params.tz);
  } else if (params.contentCompleted && STATUS_RANK[status] < STATUS_RANK.STUDIED) {
    status = "STUDIED";
    nextReviewAt = reviewDate(params.at, nextTopicReviewDays(0, accuracy), params.tz);
  } else if (status === "NOT_STUDIED" && params.minutes > 0) {
    status = "IN_PROGRESS";
  }

  const data = {
    status,
    reviewCount,
    nextReviewAt,
    lastReviewedAt,
    studiedMinutes: (current?.studiedMinutes ?? 0) + Math.max(0, Math.round(params.minutes)),
    questionsAnswered: answered,
    questionsCorrect: correct,
    lastStudiedAt: params.minutes > 0 || isReview ? params.at : (current?.lastStudiedAt ?? null),
  };

  return tx.topicProgress.upsert({
    where: { userId_topicId: { userId: params.userId, topicId: params.topicId } },
    update: data,
    create: { userId: params.userId, topicId: params.topicId, ...data },
  });
}

/** Manual status from the edital. Schedules the first review when marking as studied. */
export async function setTopicStatusManually(tx: Tx, userId: string, topicId: string, status: TopicStatus, tz: string) {
  const now = new Date();
  const current = await tx.topicProgress.findUnique({ where: { userId_topicId: { userId, topicId } } });
  const accuracy = current && current.questionsAnswered >= 5 ? current.questionsCorrect / current.questionsAnswered : null;

  let nextReviewAt = current?.nextReviewAt ?? null;
  let reviewCount = current?.reviewCount ?? 0;
  let lastReviewedAt = current?.lastReviewedAt ?? null;
  if (status === "NOT_STUDIED" || status === "IN_PROGRESS") {
    nextReviewAt = null;
  } else if (status === "STUDIED" && (!current || STATUS_RANK[current.status] < STATUS_RANK.STUDIED)) {
    nextReviewAt = reviewDate(now, nextTopicReviewDays(0, accuracy), tz);
  } else if (status === "REVIEWED") {
    reviewCount += current?.status === "REVIEWED" ? 0 : 1;
    lastReviewedAt = now;
    nextReviewAt = reviewDate(now, nextTopicReviewDays(reviewCount, accuracy), tz);
  }

  return tx.topicProgress.upsert({
    where: { userId_topicId: { userId, topicId } },
    update: { status, statusSetManually: true, nextReviewAt, reviewCount, lastReviewedAt },
    create: { userId, topicId, status, statusSetManually: true, nextReviewAt, reviewCount, lastReviewedAt },
  });
}
