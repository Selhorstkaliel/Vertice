import { formatPercent } from "@/lib/format";
import { clamp } from "@/lib/utils";

/**
 * Performance Engine — Índice de Preparação (0–100).
 *
 * Deliberately NOT an approval probability. It summarizes preparation
 * evidence, re-normalizing weights when a component has no data yet, and
 * refuses to produce a number when evidence is insufficient.
 */

export const READINESS_ENGINE_VERSION = "readiness-1.0";
export const MIN_ANSWERS_FOR_PERFORMANCE = 20;

export interface ReadinessInput {
  competitionName: string;
  /** Weighted share of edital studied, 0..1. */
  coverage: number;
  topicsTotal: number;
  topicsNotStudied: number;
  answered: number;
  correct: number;
  /** Recent simulation scores 0..1, newest first. */
  simulationScores: number[];
  /** Share of scheduled topic reviews done on time and card retention, 0..1. */
  reviewHealth: number | null;
  /** Planned vs executed adherence, 0..1. */
  consistency: number | null;
  /** Accuracy last 14 days minus previous 14 days (needs data in both). */
  accuracyTrend: number | null;
  subjects: { name: string; accuracy: number | null; answered: number }[];
  criticalTopics: { name: string; accuracy: number }[];
  targetAccuracy?: number;
}

export interface ReadinessComponent {
  key: "coverage" | "performance" | "simulations" | "reviews" | "consistency" | "trend";
  label: string;
  weight: number;
  value: number | null;
  note: string;
}

export interface ReadinessResult {
  value: number | null;
  components: ReadinessComponent[];
  strengths: string[];
  gaps: string[];
  insufficientReason: string | null;
  engineVersion: string;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const target = input.targetAccuracy ?? 0.7;
  const accuracy = input.answered >= MIN_ANSWERS_FOR_PERFORMANCE ? input.correct / input.answered : null;
  const sims = input.simulationScores.slice(0, 3);
  const simAvg = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : null;

  const components: ReadinessComponent[] = [
    {
      key: "coverage",
      label: "Edital estudado",
      weight: 0.3,
      value: input.topicsTotal > 0 ? clamp(input.coverage, 0, 1) : null,
      note: input.topicsTotal > 0 ? `${formatPercent(input.coverage)} do edital` : "Edital sem tópicos",
    },
    {
      key: "performance",
      label: "Desempenho em questões",
      weight: 0.3,
      // Accuracy at target counts as 85/100; 100% accuracy as 100.
      value: accuracy === null ? null : clamp(accuracy <= target ? (accuracy / target) * 0.85 : 0.85 + ((accuracy - target) / (1 - target)) * 0.15, 0, 1),
      note: accuracy === null ? `Mínimo de ${MIN_ANSWERS_FOR_PERFORMANCE} questões (${input.answered} respondidas)` : `${formatPercent(accuracy)} de acertos em ${input.answered} questões`,
    },
    {
      key: "simulations",
      label: "Simulados",
      weight: 0.15,
      value: simAvg,
      note: simAvg === null ? "Nenhum simulado concluído" : `Média de ${formatPercent(simAvg)} nos últimos ${sims.length}`,
    },
    {
      key: "reviews",
      label: "Revisões em dia",
      weight: 0.1,
      value: input.reviewHealth,
      note: input.reviewHealth === null ? "Sem revisões programadas ainda" : `${formatPercent(input.reviewHealth)} em dia`,
    },
    {
      key: "consistency",
      label: "Consistência",
      weight: 0.1,
      value: input.consistency,
      note: input.consistency === null ? "Disponível após a primeira semana de plano" : `${formatPercent(input.consistency)} do planejado executado`,
    },
    {
      key: "trend",
      label: "Tendência recente",
      weight: 0.05,
      value: input.accuracyTrend === null ? null : clamp(0.5 + input.accuracyTrend / 0.3, 0, 1),
      note:
        input.accuracyTrend === null
          ? "Dados insuficientes para tendência"
          : `${input.accuracyTrend >= 0 ? "+" : ""}${Math.round(input.accuracyTrend * 100)} p.p. nas últimas duas semanas`,
    },
  ];

  const hasCoverage = components[0]!.value !== null;
  const hasBehavior = accuracy !== null || input.consistency !== null || simAvg !== null;
  if (!hasCoverage || !hasBehavior) {
    return {
      value: null,
      components,
      strengths: [],
      gaps: [],
      insufficientReason: !hasCoverage
        ? "Adicione os conteúdos do edital para calcular o índice."
        : `Responda pelo menos ${MIN_ANSWERS_FOR_PERFORMANCE} questões, conclua um simulado ou uma semana de plano para calcular o índice.`,
      engineVersion: READINESS_ENGINE_VERSION,
    };
  }

  const available = components.filter((c) => c.value !== null);
  const totalWeight = available.reduce((a, c) => a + c.weight, 0);
  let value = (available.reduce((a, c) => a + c.weight * (c.value ?? 0), 0) / totalWeight) * 100;

  const critical = input.criticalTopics.slice(0, 4);
  value -= Math.min(8, critical.length * 2);
  value = Math.round(clamp(value, 0, 100));

  const strengths: string[] = [];
  const gaps: string[] = [];

  const measured = input.subjects.filter((s) => s.accuracy !== null && s.answered >= 10);
  const bestSubject = [...measured].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
  if (bestSubject && (bestSubject.accuracy ?? 0) >= target) {
    strengths.push(`Bom desempenho em ${bestSubject.name} (${formatPercent(bestSubject.accuracy)})`);
  }
  if (input.consistency !== null && input.consistency >= 0.8) strengths.push(`Alta consistência (${formatPercent(input.consistency)})`);
  if (input.accuracyTrend !== null && input.accuracyTrend >= 0.05) strengths.push("Tendência de melhora nos acertos");
  if (input.coverage >= 0.75) strengths.push(`${formatPercent(input.coverage)} do edital estudado`);

  for (const s of measured.filter((s) => (s.accuracy ?? 1) < target).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)).slice(0, 2)) {
    gaps.push(`${s.name} abaixo da meta (${formatPercent(s.accuracy)})`);
  }
  if (input.topicsTotal > 0 && input.topicsNotStudied > 0) {
    gaps.push(`${formatPercent(input.topicsNotStudied / input.topicsTotal)} do edital ainda não estudado`);
  }
  if (critical.length) gaps.push(`Conteúdos críticos: ${critical.map((c) => c.name).join(", ")}`);
  if (input.consistency !== null && input.consistency < 0.6) gaps.push(`Execução de ${formatPercent(input.consistency)} do plano`);
  if (input.accuracyTrend !== null && input.accuracyTrend <= -0.05) gaps.push("Queda recente nos acertos");

  return { value, components, strengths, gaps, insufficientReason: null, engineVersion: READINESS_ENGINE_VERSION };
}

/** Consecutive active days ending today (or yesterday, so the streak survives until day's end). */
export function computeStreak(activeDayKeys: Set<string>, todayKey: string, addDays: (k: string, n: number) => string) {
  let cursor = activeDayKeys.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (activeDayKeys.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
