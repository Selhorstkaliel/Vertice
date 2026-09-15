import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { QuestionForm } from "@/components/questions/question-form";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getAuthoringOptions } from "@/modules/questions/queries";

export const metadata: Metadata = { title: "Nova questão" };

export default async function NewQuestionPage() {
  const user = await requireOnboardedUser();
  const options = await getAuthoringOptions(user.id);
  return (
    <div className="flex flex-col">
      <PageHeader title="Nova questão" description="Questões cadastradas por você são privadas e entram nos filtros, no edital e nos simulados." />
      <QuestionForm subjects={options.subjects} boards={options.boards} competitions={options.competitions} />
    </div>
  );
}
