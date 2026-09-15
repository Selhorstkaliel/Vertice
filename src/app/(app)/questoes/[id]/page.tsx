import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { QuestionPlayer } from "@/components/questions/question-player";
import { DeleteQuestionButton } from "@/components/questions/question-form";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getQuestionForPractice, nextQuestionId, type QuestionFilters } from "@/modules/questions/queries";
import { CONTENT_SOURCE_LABEL, DIFFICULTY_LABEL } from "@/lib/labels";
import { questionFigures } from "@/lib/question-content";

export const metadata: Metadata = { title: "Resolver questão" };

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<QuestionFilters> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const sp = await searchParams;
  const q = await getQuestionForPractice(user.id, id);
  if (!q) notFound();

  const filters: QuestionFilters = {
    concurso: sp.concurso,
    banca: sp.banca,
    ano: sp.ano,
    materia: sp.materia,
    assunto: sp.assunto,
    dificuldade: sp.dificuldade,
    status: sp.status,
    fonte: sp.fonte,
    prova: sp.prova,
    q: sp.q,
  };
  const qs = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1])).toString();
  const nextId = await nextQuestionId(user.id, filters, q.id);
  const nextHref = nextId ? `/questoes/${nextId}${qs ? `?${qs}` : ""}` : null;

  const origin =
    q.source === "OFFICIAL" && q.sourceReference
      ? q.sourceReference
      : q.source === "GENERATED"
        ? (q.sourceReference ?? "Gerada por IA. Não é questão oficial.")
        : [q.examBoard?.name, q.year, q.competition?.name].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/questoes${qs ? `?${qs}` : ""}`} className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg">
          <ChevronLeft className="size-4" />
          Banco de questões
        </Link>
        {q.owned && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/questoes/${q.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
            <DeleteQuestionButton id={q.id} />
          </div>
        )}
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-[-0.015em]">{q.subject.name}</h1>
          {q.type === "TRUE_FALSE" && <Badge tone="outline">Certo ou errado</Badge>}
          {q.source === "OFFICIAL" && <Badge tone="outline">Prova oficial</Badge>}
          {q.source === "GENERATED" && <Badge tone="info">Gerada por IA</Badge>}
          {q.state && q.state.attempts > 0 && (
            <Badge tone={q.state.lastCorrect ? "positive" : "danger"}>
              {q.state.attempts === 1 ? "Respondida 1 vez" : `Respondida ${q.state.attempts} vezes`}, última {q.state.lastCorrect ? "certa" : "errada"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-fg-subtle">{origin ? origin : CONTENT_SOURCE_LABEL[q.source]}</p>
      </header>

      <QuestionPlayer
        question={{
          id: q.id,
          type: q.type,
          statement: q.statement,
          figures: questionFigures(q.figures),
          options: q.options,
          favorite: q.state?.favorite ?? false,
          reviewLater: q.state?.reviewLater ?? false,
          flashcardId: q.flashcardId,
        }}
        nextHref={nextHref}
        afterAnswer={
          <dl className="grid gap-x-8 gap-y-3 text-base sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-fg-subtle">Assunto</dt>
              <dd className="text-fg">
                {q.topic ? (
                  <Link href={`/edital?topico=${q.topicId}`} className="hover:underline hover:underline-offset-4">
                    {q.topic.parent ? `${q.topic.parent.name} › ${q.topic.name}` : q.topic.name}
                  </Link>
                ) : (
                  "Não informado"
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-fg-subtle">Dificuldade</dt>
              <dd className="text-fg">{DIFFICULTY_LABEL[q.difficulty]}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-fg-subtle">Origem</dt>
              <dd className="text-fg">{CONTENT_SOURCE_LABEL[q.source]}</dd>
              {q.sourceReference && <dd className="text-sm text-fg-subtle">{q.sourceReference}</dd>}
            </div>
          </dl>
        }
      />
    </div>
  );
}
