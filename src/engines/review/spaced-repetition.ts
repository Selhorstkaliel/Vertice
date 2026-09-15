/**
 * Review Engine — decides WHAT TO REVIEW and WHEN.
 *
 * Flashcards: deterministic SM-2 variant with learning steps (no randomness,
 * so every interval can be explained). Topics: expanding review intervals
 * shortened when topic accuracy is low.
 */

export type CardState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
export type Rating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export interface CardSchedule {
  state: CardState;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  learningStep: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

export const LEARNING_STEPS_MIN = [10, 1440];
export const RELEARNING_STEPS_MIN = [10];
export const MIN_EASE = 1.3;
export const MAX_INTERVAL_DAYS = 365;
const GRADUATE_INTERVAL = 1;
const EASY_GRADUATE_INTERVAL = 4;

const DAY_MS = 86_400_000;
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const addDaysPrecise = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ReviewOutcome {
  next: CardSchedule;
  explanation: string;
}

function describeInterval(days: number): string {
  if (days < 1) {
    const minutes = Math.round(days * 1440);
    return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  }
  const d = Math.round(days);
  if (d < 30) return `${d} ${d === 1 ? "dia" : "dias"}`;
  const months = Math.round(d / 30);
  return `${months} ${months === 1 ? "mês" : "meses"}`;
}

export function reviewCard(card: CardSchedule, rating: Rating, now: Date): ReviewOutcome {
  const next: CardSchedule = { ...card, lastReviewedAt: now, reps: card.reps + 1 };

  const inLearning = card.state === "NEW" || card.state === "LEARNING" || card.state === "RELEARNING";
  if (inLearning) {
    const steps = card.state === "RELEARNING" ? RELEARNING_STEPS_MIN : LEARNING_STEPS_MIN;
    const graduateInterval = card.state === "RELEARNING" ? Math.max(1, card.intervalDays) : GRADUATE_INTERVAL;

    if (rating === "AGAIN") {
      next.state = card.state === "RELEARNING" ? "RELEARNING" : "LEARNING";
      next.learningStep = 0;
      next.dueAt = addMinutes(now, steps[0]!);
      return { next, explanation: `Voltou ao início da fase de aprendizagem. Nova tentativa em ${steps[0]} min.` };
    }
    if (rating === "HARD") {
      next.state = card.state === "NEW" ? "LEARNING" : card.state;
      const step = steps[Math.min(card.learningStep, steps.length - 1)]!;
      const delay = Math.round(step * 1.5);
      next.dueAt = addMinutes(now, delay);
      return { next, explanation: `Mesma etapa de aprendizagem, repetida em ${describeInterval(delay / 1440)}.` };
    }
    if (rating === "EASY") {
      const interval = card.state === "RELEARNING" ? graduateInterval * 1.5 : EASY_GRADUATE_INTERVAL;
      next.state = "REVIEW";
      next.learningStep = 0;
      next.intervalDays = r2(interval);
      next.ease = r2(card.ease + 0.15);
      next.dueAt = addDaysPrecise(now, interval);
      return { next, explanation: `Marcado como fácil: sai da aprendizagem com intervalo de ${describeInterval(interval)}.` };
    }
    // GOOD
    const nextStep = card.learningStep + 1;
    if (nextStep >= steps.length) {
      next.state = "REVIEW";
      next.learningStep = 0;
      next.intervalDays = r2(graduateInterval);
      next.dueAt = addDaysPrecise(now, graduateInterval);
      return { next, explanation: `Aprendizagem concluída. Próxima revisão em ${describeInterval(graduateInterval)}.` };
    }
    next.state = "LEARNING";
    next.learningStep = nextStep;
    next.dueAt = addMinutes(now, steps[nextStep]!);
    return { next, explanation: `Próxima etapa de aprendizagem em ${describeInterval(steps[nextStep]! / 1440)}.` };
  }

  // REVIEW state
  const scheduledInterval = Math.max(card.intervalDays, 1);
  const elapsed = card.lastReviewedAt ? (now.getTime() - card.lastReviewedAt.getTime()) / DAY_MS : scheduledInterval;
  const overdue = Math.max(0, elapsed - scheduledInterval);

  if (rating === "AGAIN") {
    next.state = "RELEARNING";
    next.lapses = card.lapses + 1;
    next.learningStep = 0;
    next.ease = r2(Math.max(MIN_EASE, card.ease - 0.2));
    next.intervalDays = r2(Math.max(1, scheduledInterval * 0.5));
    next.dueAt = addMinutes(now, RELEARNING_STEPS_MIN[0]!);
    return {
      next,
      explanation: `Esquecimento registrado (${next.lapses}º). Reaprendizagem em ${RELEARNING_STEPS_MIN[0]} min; facilidade reduzida para ${next.ease.toFixed(2)}.`,
    };
  }

  let interval: number;
  let ease = card.ease;
  if (rating === "HARD") {
    interval = Math.max(scheduledInterval + 1, scheduledInterval * 1.2);
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (rating === "GOOD") {
    interval = Math.max(scheduledInterval + 1, (scheduledInterval + overdue / 2) * ease);
  } else {
    interval = Math.max(scheduledInterval + 1, (scheduledInterval + overdue) * ease * 1.3);
    ease = ease + 0.15;
  }
  interval = Math.min(MAX_INTERVAL_DAYS, interval);
  next.state = "REVIEW";
  next.intervalDays = r2(interval);
  next.ease = r2(ease);
  next.dueAt = addDaysPrecise(now, interval);

  const label = { HARD: "difícil", GOOD: "bom", EASY: "fácil" }[rating];
  return {
    next,
    explanation: `Resposta "${label}": intervalo passou de ${describeInterval(scheduledInterval)} para ${describeInterval(interval)} (facilidade ${next.ease.toFixed(2)}).`,
  };
}

/** Preview of the interval each rating would produce — shown on the buttons. */
export function previewIntervals(card: CardSchedule, now: Date): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of ["AGAIN", "HARD", "GOOD", "EASY"] as Rating[]) {
    const { next } = reviewCard(card, r, now);
    out[r] = describeInterval((next.dueAt.getTime() - now.getTime()) / DAY_MS);
  }
  return out;
}

/* ── Topic reviews ───────────────────────────────────────────────── */

export const TOPIC_REVIEW_INTERVALS = [1, 7, 15, 30, 60];

/**
 * Next review offset (days) for an edital topic after the Nth review.
 * Low accuracy holds the topic one step back.
 */
export function nextTopicReviewDays(reviewCount: number, accuracy: number | null): number {
  let step = Math.min(reviewCount, TOPIC_REVIEW_INTERVALS.length - 1);
  if (accuracy !== null && accuracy < 0.6) step = Math.max(0, step - 1);
  return TOPIC_REVIEW_INTERVALS[step]!;
}
