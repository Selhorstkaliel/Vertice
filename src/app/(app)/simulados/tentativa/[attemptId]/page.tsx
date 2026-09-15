import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SimulationRunner } from "@/components/simulations/simulation-runner";
import { questionFigures } from "@/lib/question-content";
import { requireOnboardedUser } from "@/modules/auth/session";
import { DEADLINE_GRACE_MS, finalizeAttempt, getAttemptForTaking } from "@/modules/simulations/service";

export const metadata: Metadata = { title: "Simulado em andamento" };
export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireOnboardedUser();
  const { attemptId } = await params;
  const attempt = await getAttemptForTaking(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status !== "IN_PROGRESS") redirect(`/simulados/resultado/${attempt.id}`);

  // The clock keeps running while the student is away: close expired attempts on arrival.
  if (attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    await finalizeAttempt(user.id, attempt.id, user.profile.timezone);
    redirect(`/simulados/resultado/${attempt.id}`);
  }

  return (
    <SimulationRunner
      attemptId={attempt.id}
      title={attempt.simulation.title}
      deadlineAt={attempt.deadlineAt?.toISOString() ?? null}
      questions={attempt.simulation.questions.map((sq) => ({
        simulationQuestionId: sq.id,
        type: sq.question.type,
        statement: sq.question.statement,
        figures: questionFigures(sq.question.figures),
        subjectName: sq.question.subject.name,
        options: sq.question.options,
      }))}
      initialAnswers={Object.fromEntries(attempt.answers.map((a) => [a.simulationQuestionId, { optionId: a.selectedOptionId, flagged: a.flagged }]))}
    />
  );
}
