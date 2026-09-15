import type { Metadata } from "next";
import { Target } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { GoalDialog, GoalMenu } from "@/components/goals/goal-controls";
import { GoalProgress } from "@/components/goals/goal-row";
import { formatGoalValue, goalTitle } from "@/modules/goals/format";
import { requireOnboardedUser } from "@/modules/auth/session";
import { GOAL_KIND_MEASURE, listGoals, recordGoalCompletions, type GoalView } from "@/modules/goals/service";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Metas" };

const PERIOD_NAME = { DAILY: "hoje", WEEKLY: "nesta semana", MONTHLY: "neste mês" } as const;
const PREVIOUS_NAME = { DAILY: "Ontem", WEEKLY: "Semana passada", MONTHLY: "Mês passado" } as const;

function GoalItem({ goal, subjects }: { goal: GoalView; subjects: { id: string; name: string }[] }) {
  const title = goalTitle(goal);
  return (
    <li className="flex flex-col gap-3 border-b border-line-soft py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-medium text-fg">{title}</h3>
          <p className="text-sm text-fg-subtle">{GOAL_KIND_MEASURE[goal.kind]}</p>
        </div>
        <GoalMenu goal={{ id: goal.id, kind: goal.kind, period: goal.period, target: goal.target, subjectId: goal.subjectId }} active={goal.isActive} subjects={subjects} label={title} />
      </div>
      {goal.isActive ? (
        <>
          <GoalProgress goal={goal} />
          {goal.previous && (
            <p className="text-sm text-fg-subtle">
              {PREVIOUS_NAME[goal.period]}: {formatGoalValue(goal.kind, goal.previous.value)}
              {goal.previous.met ? ", meta cumprida." : ", meta não cumprida."}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-fg-subtle">
          Pausada. {PERIOD_NAME[goal.period].charAt(0).toUpperCase() + PERIOD_NAME[goal.period].slice(1)}: {formatGoalValue(goal.kind, goal.value)}.
        </p>
      )}
    </li>
  );
}

export default async function GoalsPage() {
  const user = await requireOnboardedUser();
  const [goals, subjects] = await Promise.all([
    listGoals(user.id, user.profile.timezone),
    db.subject.findMany({
      where: { competitions: { some: { competition: { enrollments: { some: { userId: user.id, status: { not: "ARCHIVED" } } } } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  await recordGoalCompletions(user.id, goals);
  const active = goals.filter((g) => g.isActive);
  const paused = goals.filter((g) => !g.isActive);
  const done = active.filter((g) => g.status.pace === "DONE").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Metas"
        description="Metas de horas, questões, tópicos, flashcards, simulados e revisões, acompanhadas pelo que você realmente registra."
        actions={goals.length > 0 ? <GoalDialog subjects={subjects} /> : null}
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="Nenhuma meta definida"
          description="Defina metas objetivas, como 200 questões por semana ou 3 horas de estudo por dia. O progresso é atualizado a cada sessão, questão e revisão."
          action={<GoalDialog subjects={subjects} trigger={undefined} />}
        />
      ) : (
        <>
          {active.length > 0 && (
            <section aria-labelledby="active-goals" className="flex max-w-3xl flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b pb-3">
                <h2 id="active-goals" className="text-md font-semibold">
                  Ativas
                </h2>
                <span className="numeral text-sm text-fg-subtle">
                  {done} de {active.length} concluídas no período atual
                </span>
              </div>
              <ul className="flex flex-col">
                {active.map((g) => (
                  <GoalItem key={g.id} goal={g} subjects={subjects} />
                ))}
              </ul>
            </section>
          )}
          {paused.length > 0 && (
            <section aria-labelledby="paused-goals" className="flex max-w-3xl flex-col">
              <h2 id="paused-goals" className="border-b pb-3 text-md font-semibold">
                Pausadas
              </h2>
              <ul className="flex flex-col">
                {paused.map((g) => (
                  <GoalItem key={g.id} goal={g} subjects={subjects} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
