import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, ListChecks, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Pagination, pageFrom } from "@/components/ui/pagination";
import { QuestionFilters } from "@/components/questions/question-filters";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getQuestionFilterOptions, listQuestions, type QuestionFilters as Filters } from "@/modules/questions/queries";
import { CONTENT_SOURCE_LABEL, DIFFICULTY_LABEL } from "@/lib/labels";
import { richToPlain } from "@/engines/questions/rich-text";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Questões" };

type Search = Filters & { pagina?: string };

function statusOf(state: { attempts: number; lastCorrect: boolean | null } | null) {
  if (!state || state.attempts === 0) return { label: "Nunca respondida", rail: "bg-line", tone: "text-fg-subtle" };
  return state.lastCorrect
    ? { label: "Acertada", rail: "bg-positive", tone: "text-positive" }
    : { label: "Errada", rail: "bg-danger", tone: "text-danger" };
}

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const page = pageFrom(params.pagina);
  const filters: Filters = {
    concurso: params.concurso,
    banca: params.banca,
    ano: params.ano,
    materia: params.materia,
    assunto: params.assunto,
    dificuldade: params.dificuldade,
    status: params.status,
    fonte: params.fonte,
    prova: params.prova,
    q: params.q,
  };
  const [result, options] = await Promise.all([listQuestions(user.id, filters, page), getQuestionFilterOptions(user.id, params.materia)]);
  const qs = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1])).toString();
  const withFilters = (href: string) => (qs ? `${href}?${qs}` : href);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Banco de questões"
        description="Resolva, veja a resolução e transforme erros em revisão. As respondidas aqui atualizam o edital e o plano."
        actions={
          <Button asChild variant="secondary">
            <Link href="/questoes/nova">
              <Plus />
              Nova questão
            </Link>
          </Button>
        }
      />

      <QuestionFilters competitions={options.competitions} boards={options.boards} papers={options.papers} years={options.years} subjects={options.subjects} topics={options.topics} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <p className="text-base text-fg-muted">
          <span className="numeral text-fg">{formatNumber(result.total)}</span> {result.total === 1 ? "questão encontrada" : "questões encontradas"}
        </p>
        {result.items[0] && (
          <Button asChild variant="primary" size="sm">
            <Link href={withFilters(`/questoes/${result.items[0].id}`)}>Resolver em sequência</Link>
          </Button>
        )}
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="Nenhuma questão com esses filtros"
          description="Ajuste os filtros ou cadastre suas próprias questões, com a origem indicada."
          action={
            <Button asChild variant="secondary">
              <Link href="/questoes/nova">Cadastrar questão</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {result.items.map((q) => {
            const status = statusOf(q.state);
            return (
              <li key={q.id} className="relative border-b border-line-soft">
                <span aria-hidden="true" className={cn("absolute top-4 bottom-4 left-0 w-0.5 rounded-full", status.rail)} />
                <Link href={withFilters(`/questoes/${q.id}`)} className="group flex flex-col gap-1.5 py-4 pr-2 pl-4 hover:bg-surface/50">
                  <p className="line-clamp-2 text-base text-fg group-hover:underline group-hover:decoration-fg-faint group-hover:underline-offset-4">{richToPlain(q.statement)}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-fg-subtle">
                    {filters.prova && q.questionNumber && <span className="font-medium text-fg-muted">Questão {q.questionNumber}</span>}
                    <span className={status.tone}>{status.label}</span>
                    <span>
                      {q.subject.name}
                      {q.topic ? ` › ${q.topic.name}` : ""}
                    </span>
                    <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
                    <span>
                      {q.source === "OFFICIAL" && q.competition
                        ? `Prova oficial ${q.competition.name}${q.year ? ` ${q.year}` : ""}`
                        : q.source === "GENERATED"
                          ? `Gerada por IA${q.competition ? ` no estilo ${q.competition.name}` : ""}`
                          : q.examBoard || q.year
                            ? [q.examBoard?.name, q.year].filter(Boolean).join(" ")
                            : CONTENT_SOURCE_LABEL[q.source]}
                    </span>
                    {q.type === "TRUE_FALSE" && <span>Certo ou errado</span>}
                    {q.state?.favorite && (
                      <span className="inline-flex items-center gap-1 text-fg-muted">
                        <Star className="size-3.5 fill-current" aria-hidden="true" />
                        Favorita
                      </span>
                    )}
                    {q.state?.reviewLater && (
                      <span className="inline-flex items-center gap-1 text-info">
                        <Bookmark className="size-3.5" aria-hidden="true" />
                        Resolver depois
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} pages={result.pages} basePath="/questoes" params={{ ...filters }} />
    </div>
  );
}
