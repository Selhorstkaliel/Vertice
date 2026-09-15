import { Progress } from "@/components/ui/display";
import { plural } from "@/lib/format";
import { formatGoalValue, goalTitle } from "@/modules/goals/format";
import type { GoalView } from "@/modules/goals/service";
import { cn } from "@/lib/utils";

const PACE: Record<GoalView["status"]["pace"], { text: string; tone: string; bar: "positive" | "info" | "warning" | "neutral" }> = {
  DONE: { text: "Concluída", tone: "text-positive", bar: "positive" },
  ON_TRACK: { text: "No ritmo", tone: "text-fg-muted", bar: "info" },
  BEHIND: { text: "Abaixo do ritmo", tone: "text-warning", bar: "warning" },
  NOT_STARTED: { text: "Sem registros ainda", tone: "text-fg-subtle", bar: "neutral" },
};

export function GoalProgress({ goal, compact = false }: { goal: GoalView; compact?: boolean }) {
  const pace = PACE[goal.status.pace];
  const periodLeft =
    goal.period === "DAILY" ? "hoje" : goal.status.daysLeft === 0 ? "último dia do período" : `${plural(goal.status.daysLeft, "dia restante", "dias restantes")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="numeral text-base text-fg">
          {formatGoalValue(goal.kind, goal.value)} <span className="text-fg-subtle">de {formatGoalValue(goal.kind, goal.target)}</span>
        </span>
        <span className={cn("text-sm", pace.tone)}>
          {pace.text}
          {!compact && goal.status.pace !== "DONE" ? `, ${periodLeft}` : ""}
        </span>
      </div>
      <Progress value={goal.status.ratio} tone={pace.bar} size="xs" label={`Progresso: ${goalTitle(goal)}`} />
    </div>
  );
}
