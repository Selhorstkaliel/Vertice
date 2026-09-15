import { formatPercent } from "@/lib/format";
import { clamp } from "@/lib/utils";
import type { Explanation, PlanItemKind, TopicStatus } from "../types";

/**
 * Study Engine — decides WHAT to study.
 *
 * priority = relevance × deficiency × urgency × incidence × reviewNeed × recency
 *
 * Every factor is kept with a human-readable explanation so the plan can
 * always answer "Por quê?". Unknown official data (weights, incidence) is
 * treated as neutral and disclosed, never guessed.
 */

export const DEFAULT_TARGET_ACCURACY = 0.7;
/** Answers needed before accuracy is trusted over the prior. */
export const MIN_ANSWERS_FOR_ACCURACY = 5;

export interface CompetitionLink {
  competitionId: string;
  competitionName: string;
  isPrimary: boolean;
  /** Subject share of the exam, normalized so an equal split = 1. Null = weight not confirmed. */
  weightShare: number | null;
  /** Historical incidence 0..1, null when unknown. */
  incidence: number | null;
  daysToExam: number | null;
}

export interface TopicProgressInput {
  status: TopicStatus;
  questionsAnswered: number;
  questionsCorrect: number;
  studiedMinutes: number;
  /** Days since last study, null if never. */
  daysSinceStudied: number | null;
  /** Days until next review (negative = overdue), null if not scheduled. */
  daysToReview: number | null;
}

export interface TopicCandidate {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  subjectArea: string | null;
  parentName: string | null;
  competitions: CompetitionLink[];
  progress: TopicProgressInput | null;
  hardSubject: boolean;
  recentErrors: number;
}

export interface PriorityFactors {
  relevance: number;
  deficiency: number;
  urgency: number;
  incidence: number;
  reviewNeed: number;
  recency: number;
}

export interface ScoredTopic extends TopicCandidate {
  score: number;
  factors: PriorityFactors;
  accuracy: number | null;
  suggestedKind: PlanItemKind;
  reasons: Explanation[];
  /** Short sentence summarizing the top reasons. */
  summary: string;
  /** Needs a high-energy slot (new, hard or quantitative content). */
  demanding: boolean;
}

export function smoothedAccuracy(correct: number, answered: number, prior = DEFAULT_TARGET_ACCURACY, weight = 2) {
  return (correct + prior * weight) / (answered + weight);
}

const QUANTITATIVE_AREAS = new Set(["Exatas"]);

export function scoreTopic(topic: TopicCandidate, targetAccuracy = DEFAULT_TARGET_ACCURACY): ScoredTopic {
  const reasons: Explanation[] = [];
  const p = topic.progress;
  const status: TopicStatus = p?.status ?? "NOT_STUDIED";
  const answered = p?.questionsAnswered ?? 0;
  const accuracy = answered >= MIN_ANSWERS_FOR_ACCURACY ? smoothedAccuracy(p!.questionsCorrect, answered) : null;
  const name = topic.topicName;

  /* relevance ─ weight of the subject across the student's competitions */
  let relevance = 0;
  let unconfirmedWeight = false;
  for (const c of topic.competitions) {
    const share = c.weightShare ?? 1;
    if (c.weightShare === null) unconfirmedWeight = true;
    relevance += (c.isPrimary ? 1 : 0.5) * share;
  }
  relevance = clamp(relevance || 0.5, 0.25, 2.5);
  const primary = topic.competitions.find((c) => c.isPrimary) ?? topic.competitions[0];
  const maxShare = Math.max(...topic.competitions.map((c) => c.weightShare ?? 1));
  if (maxShare >= 1.25 && primary) {
    reasons.push({ code: "HIGH_WEIGHT", text: `${topic.subjectName} tem peso elevado no edital de ${primary.competitionName}.`, weight: 0.5 + (maxShare - 1) });
  }
  if (topic.competitions.length > 1) {
    const names = topic.competitions.map((c) => c.competitionName);
    reasons.push({ code: "SHARED", text: `Conteúdo compartilhado: conta para ${names.slice(0, -1).join(", ")} e ${names.at(-1)}.`, weight: 0.35 });
  }

  /* deficiency ─ how far from mastery */
  let deficiency: number;
  if (accuracy !== null) {
    deficiency = clamp(0.25 + (targetAccuracy - accuracy) * 2.2, 0.2, 1);
    if (accuracy < targetAccuracy) {
      reasons.push({
        code: "LOW_ACCURACY",
        text: `Desempenho de ${formatPercent(accuracy)} em ${name} (${answered} questões), abaixo da meta de ${formatPercent(targetAccuracy)}.`,
        weight: 1 + (targetAccuracy - accuracy) * 4,
      });
    }
  } else if (status === "NOT_STUDIED") {
    deficiency = 0.85;
    reasons.push({ code: "NOT_STUDIED", text: `${name} ainda não foi estudado.`, weight: 0.9 });
  } else if (status === "IN_PROGRESS") {
    deficiency = 0.7;
    reasons.push({ code: "IN_PROGRESS", text: `${name} está em andamento.`, weight: 0.6 });
  } else {
    deficiency = 0.45;
    if (answered < MIN_ANSWERS_FOR_ACCURACY) {
      reasons.push({ code: "NO_EVIDENCE", text: `${name} foi estudado, mas ainda tem poucas questões para medir desempenho.`, weight: 0.45 });
    }
  }
  if (topic.hardSubject && accuracy === null) {
    deficiency = Math.min(1, deficiency + 0.1);
    reasons.push({ code: "SELF_REPORTED_HARD", text: `Você indicou ${topic.subjectName} como disciplina difícil.`, weight: 0.3 });
  }
  if (topic.recentErrors >= 3) {
    deficiency = Math.min(1, deficiency + 0.1);
    reasons.push({ code: "RECENT_ERRORS", text: `${topic.recentErrors} erros registrados em ${name} nos últimos 30 dias.`, weight: 0.4 + topic.recentErrors * 0.05 });
  }

  /* urgency ─ time left until the closest exam */
  const days = topic.competitions
    .map((c) => c.daysToExam)
    .filter((d): d is number => d !== null && d >= 0);
  const closest = days.length ? Math.min(...days) : null;
  let urgency = 1;
  if (closest !== null) {
    urgency = 1 + 0.8 * clamp((180 - closest) / 165, 0, 1);
    const exam = topic.competitions.find((c) => c.daysToExam === closest);
    if (closest <= 120 && exam) {
      reasons.push({ code: "EXAM_SOON", text: `Faltam ${closest} dias para ${exam.competitionName}.`, weight: 0.3 + (urgency - 1) });
    }
    if (closest <= 21 && status === "NOT_STUDIED") {
      urgency *= 0.8;
      reasons.push({ code: "FINAL_STRETCH", text: "Reta final: revisões de conteúdo já estudado têm prioridade sobre conteúdo novo.", weight: 0.3 });
    }
  }

  /* incidence ─ only when actually registered */
  const knownIncidence = topic.competitions.map((c) => c.incidence).filter((i): i is number => i !== null);
  let incidence = 1;
  if (knownIncidence.length) {
    const max = Math.max(...knownIncidence);
    incidence = 0.7 + 0.6 * clamp(max, 0, 1);
    if (max >= 0.6) reasons.push({ code: "HIGH_INCIDENCE", text: `Alta incidência registrada para ${name} na prova.`, weight: 0.8 });
  }

  /* review need */
  let reviewNeed = 1;
  if (p && p.daysToReview !== null && p.daysToReview <= 0 && status !== "NOT_STUDIED") {
    const overdue = -p.daysToReview;
    reviewNeed = 1.15 + Math.min(0.35, overdue * 0.03);
    reasons.push({
      code: "REVIEW_DUE",
      text: overdue === 0 ? `Revisão de ${name} prevista para hoje.` : `Revisão de ${name} atrasada há ${overdue} ${overdue === 1 ? "dia" : "dias"}.`,
      weight: 0.7 + overdue * 0.05,
    });
  } else if (p && (status === "STUDIED" || status === "REVIEWED") && (p.daysSinceStudied ?? 0) >= 14 && p.daysToReview === null) {
    reviewNeed = 1.15;
    reasons.push({ code: "STALE", text: `Você não revisa ${name} há ${p.daysSinceStudied} dias.`, weight: 0.6 });
  }

  /* recency ─ avoid hammering what was just studied */
  const recency = p && p.daysSinceStudied !== null && p.daysSinceStudied < 2 && reviewNeed === 1 ? 0.75 : 1;

  const score = relevance * deficiency * urgency * incidence * reviewNeed * recency;

  let suggestedKind: PlanItemKind;
  if (status === "NOT_STUDIED" || status === "IN_PROGRESS") suggestedKind = "NEW_CONTENT";
  else if (accuracy !== null && accuracy < targetAccuracy) suggestedKind = "QUESTIONS";
  else if (answered < 10) suggestedKind = "QUESTIONS";
  else suggestedKind = "REVIEW";

  if (unconfirmedWeight) {
    reasons.push({ code: "WEIGHT_UNCONFIRMED", text: "Peso da disciplina não confirmado no edital; considerado igual ao das demais.", weight: 0.05 });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const summary = reasons
    .filter((r) => r.code !== "WEIGHT_UNCONFIRMED")
    .slice(0, 2)
    .map((r) => r.text)
    .join(" ");

  const demanding =
    suggestedKind === "NEW_CONTENT" && (topic.hardSubject || QUANTITATIVE_AREAS.has(topic.subjectArea ?? ""));

  return {
    ...topic,
    score: Math.round(score * 1000) / 1000,
    factors: {
      relevance: round2(relevance),
      deficiency: round2(deficiency),
      urgency: round2(urgency),
      incidence: round2(incidence),
      reviewNeed: round2(reviewNeed),
      recency: round2(recency),
    },
    accuracy,
    suggestedKind,
    reasons,
    summary: summary || `${name} faz parte do seu edital.`,
    demanding,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rankTopics(topics: TopicCandidate[], targetAccuracy = DEFAULT_TARGET_ACCURACY): ScoredTopic[] {
  return topics.map((t) => scoreTopic(t, targetAccuracy)).sort((a, b) => b.score - a.score);
}

/** Priority aggregated per subject, for "Prioridade atual" and reports. */
export function subjectPriorities(scored: ScoredTopic[]) {
  const bySubject = new Map<string, ScoredTopic[]>();
  for (const t of scored) {
    const list = bySubject.get(t.subjectId) ?? [];
    list.push(t);
    bySubject.set(t.subjectId, list);
  }
  return [...bySubject.values()]
    .map((list) => {
      const top = list[0]!;
      const answered = list.reduce((a, t) => a + (t.progress?.questionsAnswered ?? 0), 0);
      const correct = list.reduce((a, t) => a + (t.progress?.questionsCorrect ?? 0), 0);
      return {
        subjectId: top.subjectId,
        subjectName: top.subjectName,
        topTopic: top,
        score: list.slice(0, 3).reduce((a, t) => a + t.score, 0) / Math.min(3, list.length),
        accuracy: answered >= MIN_ANSWERS_FOR_ACCURACY ? correct / answered : null,
        answered,
      };
    })
    .sort((a, b) => b.score - a.score);
}
