import { addDays } from "@/lib/time";

/**
 * Sober progression (§50): levels from real study time, streak records and
 * discreet personal milestones. No points, coins or rewards — every number is
 * something the student actually did.
 */

export const LEVEL_HOURS = [0, 5, 15, 30, 50, 80, 120, 170, 230, 300, 400, 520, 660, 820, 1000, 1250, 1500];

export interface LevelInfo {
  level: number;
  hours: number;
  /** Hours at which the current level started and the next one starts (null at the top). */
  floorHours: number;
  nextHours: number | null;
  progress: number;
}

export function levelFor(minutes: number): LevelInfo {
  const hours = minutes / 60;
  let index = 0;
  for (let i = 0; i < LEVEL_HOURS.length; i++) if (hours >= LEVEL_HOURS[i]!) index = i;
  const floorHours = LEVEL_HOURS[index]!;
  const nextHours = LEVEL_HOURS[index + 1] ?? null;
  return { level: index + 1, hours, floorHours, nextHours, progress: nextHours === null ? 1 : (hours - floorHours) / (nextHours - floorHours) };
}

export function longestStreak(dayKeys: Iterable<string>): number {
  const days = new Set(dayKeys);
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue;
    let length = 1;
    let cursor = addDays(d, 1);
    while (days.has(cursor)) {
      length++;
      cursor = addDays(cursor, 1);
    }
    best = Math.max(best, length);
  }
  return best;
}

export interface ProgressStats {
  studyMinutes: number;
  questions: number;
  activeDays: number;
  bestStreak: number;
  simulations: number;
  flashcardReviews: number;
  topicsStudied: number;
  goalsMet: number;
  tafResults: number;
}

export type AchievementGroup = "Estudo" | "Constância" | "Questões" | "Revisão" | "Simulados" | "Edital" | "Metas" | "Preparação física";

export interface AchievementDef {
  key: string;
  group: AchievementGroup;
  title: string;
  description: string;
  metric: keyof ProgressStats;
  threshold: number;
}

const tiers = (group: AchievementGroup, metric: keyof ProgressStats, prefix: string, values: number[], title: (n: number) => string, description: (n: number) => string): AchievementDef[] =>
  values.map((n) => ({ key: `${prefix}-${n}`, group, metric, threshold: n, title: title(n), description: description(n) }));

export const ACHIEVEMENTS: AchievementDef[] = [
  ...tiers("Estudo", "studyMinutes", "hours", [600, 3000, 6000, 15000, 30000], (m) => `${m / 60} horas`, (m) => `${m / 60} horas de estudo efetivo registradas.`),
  ...tiers("Constância", "bestStreak", "streak", [7, 30, 60, 100], (n) => `${n} dias seguidos`, (n) => `Estudou ${n} dias consecutivos.`),
  ...tiers("Constância", "activeDays", "days", [30, 100, 250], (n) => `${n} dias de estudo`, (n) => `${n} dias diferentes com estudo registrado.`),
  ...tiers("Questões", "questions", "questions", [100, 500, 1000, 5000], (n) => `${n.toLocaleString("pt-BR")} questões`, (n) => `${n.toLocaleString("pt-BR")} questões respondidas.`),
  ...tiers("Revisão", "flashcardReviews", "flashcards", [100, 1000, 5000], (n) => `${n.toLocaleString("pt-BR")} revisões`, (n) => `${n.toLocaleString("pt-BR")} revisões de flashcards.`),
  ...tiers("Simulados", "simulations", "simulations", [1, 10, 25], (n) => (n === 1 ? "Primeiro simulado" : `${n} simulados`), (n) => (n === 1 ? "Finalizou o primeiro simulado." : `${n} simulados finalizados.`)),
  ...tiers("Edital", "topicsStudied", "topics", [10, 50, 150], (n) => `${n} tópicos`, (n) => `${n} tópicos do edital estudados.`),
  ...tiers("Metas", "goalsMet", "goals", [1, 10], (n) => (n === 1 ? "Primeira meta" : `${n} metas cumpridas`), (n) => (n === 1 ? "Cumpriu uma meta pela primeira vez." : `Cumpriu metas em ${n} períodos.`)),
  ...tiers("Preparação física", "tafResults", "taf", [1, 20], (n) => (n === 1 ? "Primeiro registro de TAF" : `${n} registros de TAF`), (n) => (n === 1 ? "Registrou o primeiro resultado de TAF." : `${n} resultados de TAF registrados.`)),
];

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
  value: number;
  progress: number;
}

export function evaluateAchievements(stats: ProgressStats): AchievementState[] {
  return ACHIEVEMENTS.map((a) => {
    const value = stats[a.metric];
    return { ...a, value, unlocked: value >= a.threshold, progress: Math.min(1, value / a.threshold) };
  });
}
