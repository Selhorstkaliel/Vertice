import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/display";
import { QuestionForm, type QuestionFormValues } from "@/components/questions/question-form";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getAuthoringOptions, getOwnedQuestion } from "@/modules/questions/queries";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Editar questão" };

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const [q, options, attempts] = await Promise.all([
    getOwnedQuestion(user.id, id),
    getAuthoringOptions(user.id),
    db.questionAttempt.count({ where: { questionId: id } }),
  ]);
  if (!q) notFound();

  const multiple = q.type === "MULTIPLE_CHOICE";
  const initial: QuestionFormValues = {
    type: q.type,
    statement: q.statement,
    explanation: q.explanation ?? "",
    options: multiple
      ? [...q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })), ...Array.from({ length: Math.max(0, 5 - q.options.length) }, () => ({ text: "", isCorrect: false }))]
      : ["", "", "", "", ""].map((text, i) => ({ text, isCorrect: i === 0 })),
    trueFalseAnswer: multiple ? "" : ((q.options.find((o) => o.isCorrect)?.text as "Certo" | "Errado" | undefined) ?? ""),
    subjectId: q.subjectId,
    topicId: q.topicId ?? "",
    examBoardId: q.examBoardId ?? "",
    competitionId: q.competitionId ?? "",
    year: q.year ? String(q.year) : "",
    difficulty: q.difficulty,
    source: q.source === "OFFICIAL" || q.source === "LICENSED" ? q.source : "USER",
    sourceReference: q.sourceReference ?? "",
  };

  return (
    <div className="flex flex-col">
      <PageHeader title="Editar questão" />
      <QuestionForm
        initial={initial}
        questionId={q.id}
        subjects={options.subjects}
        boards={options.boards}
        competitions={options.competitions}
        answered={attempts > 0}
      />
    </div>
  );
}
