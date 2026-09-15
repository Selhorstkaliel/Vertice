import "server-only";
import type { CardState, FlashcardType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { questionFigures } from "@/lib/question-content";
import { addDays, localNow, zonedToUtc } from "@/lib/time";
import { previewIntervals, type CardSchedule } from "@/engines/review/spaced-repetition";

/** New cards introduced per day, so a large import doesn't flood a single day. */
export const NEW_CARDS_PER_DAY = 20;
export const FLASHCARD_PAGE_SIZE = 25;

function todayRange(tz: string) {
  const { key } = localNow(tz);
  return { start: zonedToUtc(key, 0, tz), end: zonedToUtc(addDays(key, 1), 0, tz) };
}

async function newIntroducedToday(userId: string, tz: string) {
  const { start } = todayRange(tz);
  return db.flashcardReview.count({ where: { userId, stateBefore: "NEW", reviewedAt: { gte: start } } });
}

/** Cards due by the end of today, with new cards capped by the daily limit. */
export async function countDueFlashcards(userId: string, tz: string, where: Prisma.FlashcardWhereInput = {}) {
  const { end } = todayRange(tz);
  const base = { userId, suspended: false, dueAt: { lt: end }, ...where };
  const [dueReviews, dueNew, introduced] = await Promise.all([
    db.flashcard.count({ where: { ...base, state: { not: "NEW" } } }),
    db.flashcard.count({ where: { ...base, state: "NEW" } }),
    newIntroducedToday(userId, tz),
  ]);
  return dueReviews + Math.min(dueNew, Math.max(0, NEW_CARDS_PER_DAY - introduced));
}

export function toSchedule(c: {
  state: CardState;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  learningStep: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}): CardSchedule {
  return {
    state: c.state,
    intervalDays: c.intervalDays,
    ease: c.ease,
    reps: c.reps,
    lapses: c.lapses,
    learningStep: c.learningStep,
    dueAt: c.dueAt,
    lastReviewedAt: c.lastReviewedAt,
  };
}

export interface ReviewQueueFilters {
  materia?: string;
  banca?: string;
}

/** Review queue: learning cards first, then reviews by due date, then today's allowance of new cards. */
export async function getReviewQueue(userId: string, tz: string, filters: ReviewQueueFilters, limit = 60) {
  const now = new Date();
  const { end } = todayRange(tz);
  const where: Prisma.FlashcardWhereInput = {
    userId,
    suspended: false,
    ...(filters.materia ? { subjectId: filters.materia } : {}),
    ...(filters.banca ? { examBoardId: filters.banca } : {}),
  };
  const select = {
    id: true,
    front: true,
    back: true,
    type: true,
    isBoardPattern: true,
    patternEvidence: true,
    state: true,
    intervalDays: true,
    ease: true,
    reps: true,
    lapses: true,
    learningStep: true,
    dueAt: true,
    lastReviewedAt: true,
    subject: { select: { name: true } },
    topic: { select: { name: true } },
    examBoard: { select: { name: true } },
    sourceQuestion: { select: { figures: true } },
  } satisfies Prisma.FlashcardSelect;

  const introduced = await newIntroducedToday(userId, tz);
  const [learning, reviews, fresh] = await Promise.all([
    db.flashcard.findMany({ where: { ...where, state: { in: ["LEARNING", "RELEARNING"] }, dueAt: { lt: end } }, select, orderBy: { dueAt: "asc" }, take: limit }),
    db.flashcard.findMany({ where: { ...where, state: "REVIEW", dueAt: { lt: end } }, select, orderBy: { dueAt: "asc" }, take: limit }),
    db.flashcard.findMany({
      where: { ...where, state: "NEW" },
      select,
      orderBy: { createdAt: "asc" },
      take: Math.max(0, NEW_CARDS_PER_DAY - introduced),
    }),
  ]);
  return [...learning, ...reviews, ...fresh].slice(0, limit).map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    figures: questionFigures(c.sourceQuestion?.figures),
    type: c.type,
    isBoardPattern: c.isBoardPattern,
    patternEvidence: c.patternEvidence,
    state: c.state,
    subjectName: c.subject?.name ?? null,
    topicName: c.topic?.name ?? null,
    boardName: c.examBoard?.name ?? null,
    previews: previewIntervals(toSchedule(c), now),
  }));
}

export type QueueCard = Awaited<ReturnType<typeof getReviewQueue>>[number];

export interface FlashcardFilters {
  q?: string;
  materia?: string;
  banca?: string;
  tipo?: string;
  estado?: string;
  tag?: string;
}

const TYPES = new Set(["CONCEPT", "FORMULA", "TRAP", "PERSONAL_ERROR", "RULE", "DEFINITION", "FROM_QUESTION"]);

export async function listFlashcards(userId: string, tz: string, f: FlashcardFilters, page: number) {
  const { end } = todayRange(tz);
  const where: Prisma.FlashcardWhereInput = { userId };
  if (f.materia) where.subjectId = f.materia;
  if (f.banca) where.examBoardId = f.banca;
  if (f.tipo && TYPES.has(f.tipo)) where.type = f.tipo as FlashcardType;
  if (f.tag) where.tags = { has: f.tag };
  if (f.q?.trim()) where.OR = [{ front: { contains: f.q.trim(), mode: "insensitive" } }, { back: { contains: f.q.trim(), mode: "insensitive" } }];
  switch (f.estado) {
    case "pendentes":
      where.suspended = false;
      where.dueAt = { lt: end };
      break;
    case "novos":
      where.state = "NEW";
      break;
    case "aprendizagem":
      where.state = { in: ["LEARNING", "RELEARNING"] };
      break;
    case "revisao":
      where.state = "REVIEW";
      break;
    case "suspensos":
      where.suspended = true;
      break;
  }
  const [total, rows] = await Promise.all([
    db.flashcard.count({ where }),
    db.flashcard.findMany({
      where,
      select: {
        id: true,
        front: true,
        type: true,
        state: true,
        dueAt: true,
        suspended: true,
        isBoardPattern: true,
        tags: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
        examBoard: { select: { name: true } },
      },
      orderBy: [{ dueAt: "asc" }],
      skip: (page - 1) * FLASHCARD_PAGE_SIZE,
      take: FLASHCARD_PAGE_SIZE,
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / FLASHCARD_PAGE_SIZE)), items: rows };
}

export async function flashcardStats(userId: string, tz: string) {
  const { start } = todayRange(tz);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [total, dueToday, fresh, learning, review, suspended, reviewedToday, matureReviews, matureLapses] = await Promise.all([
    db.flashcard.count({ where: { userId } }),
    countDueFlashcards(userId, tz),
    db.flashcard.count({ where: { userId, state: "NEW", suspended: false } }),
    db.flashcard.count({ where: { userId, state: { in: ["LEARNING", "RELEARNING"] }, suspended: false } }),
    db.flashcard.count({ where: { userId, state: "REVIEW", suspended: false } }),
    db.flashcard.count({ where: { userId, suspended: true } }),
    db.flashcardReview.count({ where: { userId, reviewedAt: { gte: start } } }),
    db.flashcardReview.count({ where: { userId, stateBefore: "REVIEW", reviewedAt: { gte: since30 } } }),
    db.flashcardReview.count({ where: { userId, stateBefore: "REVIEW", rating: "AGAIN", reviewedAt: { gte: since30 } } }),
  ]);
  return {
    total,
    dueToday,
    fresh,
    learning,
    review,
    suspended,
    reviewedToday,
    retention: matureReviews >= 10 ? 1 - matureLapses / matureReviews : null,
    retentionSample: matureReviews,
  };
}

export async function getFlashcardDetail(userId: string, id: string) {
  return db.flashcard.findFirst({
    where: { id, userId },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      competition: { select: { id: true, name: true } },
      examBoard: { select: { id: true, name: true } },
      sourceQuestion: { select: { id: true, figures: true } },
      reviews: { orderBy: { reviewedAt: "desc" }, take: 50 },
    },
  });
}
