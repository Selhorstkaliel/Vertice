import { clamp } from "@/lib/utils";
import { DEFAULT_TARGET_ACCURACY, MIN_ANSWERS_FOR_ACCURACY } from "./priority";

/**
 * Daily mission — one 15/20/30-minute screen built only from systems that
 * already exist: due flashcards, old unresolved error-notebook entries and one
 * weak topic. Pure: the caller passes the data and the time estimates.
 *
 * Budget split (hypotheses, adjustable): flashcards up to 35%, error notebook
 * up to 35%, weak-topic questions take the rest. Whatever one part cannot use
 * flows to the next, so the mission fills the chosen time when there is
 * material. With nothing due, the highest-priority topic fills the mission —
 * it is never empty.
 */

export const MISSION_DURATIONS = [15, 20, 30] as const;
export type MissionDuration = (typeof MISSION_DURATIONS)[number];

/** Unresolved errors younger than this are left alone (still fresh in memory). */
export const ERROR_MIN_AGE_DAYS = 3;
export const DEFAULT_SECONDS_PER_CARD = 30;
export const DEFAULT_SECONDS_PER_QUESTION = 150;
const SHARE_FLASHCARDS = 0.35;
const SHARE_ERRORS = 0.35;
/** Fewer than this is not worth a topic block. */
const MIN_TOPIC_QUESTIONS = 3;

export interface MissionTopic {
  topicId: string;
  topicName: string;
  subjectName: string;
  answered: number;
  correct: number;
  /** Days until next review, negative when overdue; null when not scheduled. */
  daysToReview: number | null;
}

export interface MissionInput {
  targetMinutes: number;
  /** Due flashcard ids, in review order. */
  dueCardIds: string[];
  /** Unresolved error entries that still have a question, oldest first. */
  errors: { entryId: string; questionId: string; ageDays: number }[];
  /** Topics of the student's edital with progress, to find a weak one. */
  topics: MissionTopic[];
  /** Highest-priority topic, used when nothing is weak or due. */
  fallbackTopic: { topicId: string; topicName: string; subjectName: string; reason: string } | null;
  secondsPerCard?: number;
  secondsPerQuestion?: number;
  targetAccuracy?: number;
}

export type MissionBlock =
  | { kind: "FLASHCARDS"; cardIds: string[]; estSeconds: number; reason: string }
  | { kind: "ERRORS"; entryIds: string[]; estSeconds: number; reason: string }
  | { kind: "TOPIC"; topicId: string; topicName: string; subjectName: string; questions: number; estSeconds: number; reason: string; weak: boolean };

export interface MissionPlan {
  targetMinutes: number;
  blocks: MissionBlock[];
  estSeconds: number;
  /** Items left out because the time ran out — shown so nothing is hidden. */
  leftOver: { cards: number; errors: number };
}

/** Lowest accuracy with a minimum sample, else the most overdue review, else null. */
export function pickWeakTopic(topics: MissionTopic[], targetAccuracy = DEFAULT_TARGET_ACCURACY) {
  const measured = topics
    .filter((t) => t.answered >= MIN_ANSWERS_FOR_ACCURACY)
    .map((t) => ({ t, accuracy: t.correct / t.answered }))
    .filter((x) => x.accuracy < targetAccuracy)
    .sort((a, b) => a.accuracy - b.accuracy || b.t.answered - a.t.answered);
  if (measured[0]) {
    const { t, accuracy } = measured[0];
    return { topic: t, reason: `${Math.round(accuracy * 100)}% de acertos em ${t.answered} questões de ${t.topicName}.` };
  }
  const overdue = topics
    .filter((t) => t.daysToReview !== null && t.daysToReview <= 0)
    .sort((a, b) => a.daysToReview! - b.daysToReview!);
  if (overdue[0]) {
    const late = -overdue[0].daysToReview!;
    return {
      topic: overdue[0],
      reason: late === 0 ? `Revisão de ${overdue[0].topicName} prevista para hoje.` : `Revisão de ${overdue[0].topicName} atrasada há ${late} ${late === 1 ? "dia" : "dias"}.`,
    };
  }
  return null;
}

export function buildDailyMission(input: MissionInput): MissionPlan {
  const target = clamp(Math.round(input.targetMinutes), 5, 120);
  const budget = target * 60;
  const perCard = clamp(input.secondsPerCard ?? DEFAULT_SECONDS_PER_CARD, 5, 180);
  const perQuestion = clamp(input.secondsPerQuestion ?? DEFAULT_SECONDS_PER_QUESTION, 30, 600);
  const errors = input.errors.filter((e) => e.ageDays >= ERROR_MIN_AGE_DAYS);
  const weak = pickWeakTopic(input.topics, input.targetAccuracy);

  // First pass: each part takes up to its share.
  let cards = Math.min(input.dueCardIds.length, Math.floor((budget * SHARE_FLASHCARDS) / perCard));
  let errs = Math.min(errors.length, Math.floor((budget * SHARE_ERRORS) / perQuestion));
  const topicFor = weak ? weak.topic : input.fallbackTopic;
  const used = () => cards * perCard + errs * perQuestion;
  let topicQuestions = topicFor ? Math.floor((budget - used()) / perQuestion) : 0;

  // A topic block too small to matter gives its time back.
  if (topicQuestions < MIN_TOPIC_QUESTIONS) topicQuestions = 0;
  // Second pass: unused time flows to the parts that still have material.
  let free = budget - used() - topicQuestions * perQuestion;
  const moreCards = Math.min(input.dueCardIds.length - cards, Math.floor(free / perCard));
  cards += Math.max(0, moreCards);
  free = budget - used() - topicQuestions * perQuestion;
  const moreErrs = Math.min(errors.length - errs, Math.floor(free / perQuestion));
  errs += Math.max(0, moreErrs);
  free = budget - used() - topicQuestions * perQuestion;
  if (topicFor && free >= perQuestion) {
    const extra = Math.floor(free / perQuestion);
    if (topicQuestions + extra >= MIN_TOPIC_QUESTIONS) topicQuestions += extra;
  }

  const blocks: MissionBlock[] = [];
  if (cards > 0) {
    blocks.push({
      kind: "FLASHCARDS",
      cardIds: input.dueCardIds.slice(0, cards),
      estSeconds: cards * perCard,
      reason: `${input.dueCardIds.length} ${input.dueCardIds.length === 1 ? "flashcard vencido" : "flashcards vencidos"} pela repetição espaçada.`,
    });
  }
  if (errs > 0) {
    blocks.push({
      kind: "ERRORS",
      entryIds: errors.slice(0, errs).map((e) => e.entryId),
      estSeconds: errs * perQuestion,
      reason: `Erros do caderno abertos há ${ERROR_MIN_AGE_DAYS} dias ou mais: refaça sem olhar a resolução.`,
    });
  }
  if (topicFor && topicQuestions > 0) {
    blocks.push({
      kind: "TOPIC",
      topicId: topicFor.topicId,
      topicName: topicFor.topicName,
      subjectName: topicFor.subjectName,
      questions: topicQuestions,
      estSeconds: topicQuestions * perQuestion,
      reason: weak ? weak.reason : input.fallbackTopic!.reason,
      weak: !!weak,
    });
  }

  return {
    targetMinutes: target,
    blocks,
    estSeconds: blocks.reduce((a, b) => a + b.estSeconds, 0),
    leftOver: { cards: input.dueCardIds.length - cards, errors: errors.length - errs },
  };
}
