import { GOAL_KIND_LABEL, GOAL_PERIOD_LABEL } from "@/lib/labels";
import { formatNumber } from "@/lib/format";

type GoalLike = { kind: keyof typeof GOAL_KIND_LABEL; period: keyof typeof GOAL_PERIOD_LABEL; target: number; subjectName: string | null };

const NOUN: Record<GoalLike["kind"], [string, string]> = {
  HOURS: ["de estudo", "de estudo"],
  QUESTIONS: ["questão", "questões"],
  TOPICS: ["tópico estudado", "tópicos estudados"],
  FLASHCARDS: ["revisão de flashcard", "revisões de flashcards"],
  SIMULATIONS: ["simulado", "simulados"],
  REVIEWS: ["sessão de revisão", "sessões de revisão"],
};

/** "200 questões por semana em Física", "3h de estudo por dia" */
export function goalTitle(g: GoalLike) {
  const [one, many] = NOUN[g.kind];
  return `${formatGoalValue(g.kind, g.target)} ${g.target === 1 ? one : many} ${GOAL_PERIOD_LABEL[g.period]}${g.subjectName ? ` em ${g.subjectName}` : ""}`;
}

export function formatGoalValue(kind: GoalLike["kind"], value: number) {
  return kind === "HOURS" ? `${formatNumber(value, value % 1 ? 1 : 0)}h` : formatNumber(value);
}
