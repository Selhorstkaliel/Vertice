import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Metric, PageHeader, SectionTitle } from "@/components/ui/display";
import { NativeSelect } from "@/components/ui/input";
import { Pagination, pageFrom } from "@/components/ui/pagination";
import { ErrorEntryRow } from "@/components/errors/error-entry-row";
import { requireOnboardedUser } from "@/modules/auth/session";
import { errorAnalytics, listErrors, type ErrorFilters } from "@/modules/errors/service";
import { db } from "@/lib/db";
import { ERROR_REASON_LABEL } from "@/lib/labels";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Caderno de erros" };

export default async function ErrorNotebookPage({ searchParams }: { searchParams: Promise<ErrorFilters & { pagina?: string }> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const page = pageFrom(params.pagina);
  const filters: ErrorFilters = { materia: params.materia, motivo: params.motivo, situacao: params.situacao ?? "abertos", assunto: params.assunto };
  const [analytics, list, subjects] = await Promise.all([
    errorAnalytics(user.id),
    listErrors(user.id, filters, page),
    db.subject.findMany({ where: { errorEntries: { some: { userId: user.id } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const tz = user.profile.timezone;

  if (analytics.total === 0) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Caderno de erros" />
        <EmptyState
          icon={<NotebookPen />}
          title="Nenhum erro registrado"
          description="Cada questão errada entra aqui automaticamente, com a sua resposta, a correta e a resolução. Você informa o motivo, e os tópicos com mais erros ganham prioridade no plano."
          action={
            <Button asChild variant="primary">
              <Link href="/questoes">Resolver questões</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const maxReason = Math.max(1, ...analytics.reasons.map((r) => r.count));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Caderno de erros"
        description="Seus erros organizados por motivo e assunto. Erros em aberto dos últimos 30 dias aumentam a prioridade do tópico no plano."
      />

      <dl className="grid grid-cols-2 gap-6 border-y py-5 sm:grid-cols-4">
        <Metric label="Erros registrados" value={formatNumber(analytics.total)} />
        <Metric label="Em aberto" value={formatNumber(analytics.open)} />
        <Metric label="Nos últimos 30 dias" value={formatNumber(analytics.recent30)} />
        <Metric
          label="Com motivo informado"
          value={formatPercent(analytics.total ? analytics.classified / analytics.total : null)}
          detail={analytics.unclassified ? `${analytics.unclassified} sem motivo` : undefined}
        />
      </dl>

      <div className="grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="reasons-title" className="flex flex-col gap-4">
          <SectionTitle>
            <span id="reasons-title">Por que você erra</span>
          </SectionTitle>
          {analytics.reasons.length === 0 ? (
            <p className="text-base text-fg-muted">Informe o motivo dos erros para ver a distribuição.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {analytics.reasons.map((r) => (
                <li key={r.reason} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
                  <Link href={`/caderno-de-erros?motivo=${r.reason}&situacao=todos`} className="truncate text-base text-fg hover:underline hover:underline-offset-4">
                    {ERROR_REASON_LABEL[r.reason]}
                  </Link>
                  <span className="h-2 overflow-hidden rounded-full bg-line-soft" aria-hidden="true">
                    <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </span>
                  <span className="numeral text-right text-base text-fg">{formatPercent(r.share)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-fg-subtle">Percentual sobre {formatNumber(analytics.classified)} erros com motivo informado.</p>
        </section>

        <section aria-labelledby="topics-title" className="flex flex-col gap-4">
          <SectionTitle>
            <span id="topics-title">Assuntos com mais erros</span>
          </SectionTitle>
          {analytics.topTopics.length === 0 ? (
            <p className="text-base text-fg-muted">Sem erros nos últimos 90 dias.</p>
          ) : (
            <table className="w-full text-left">
              <caption className="sr-only">Assuntos com mais erros nos últimos 90 dias</caption>
              <thead>
                <tr className="text-sm text-fg-subtle">
                  <th className="pb-2 font-normal">Assunto</th>
                  <th className="pb-2 text-right font-normal">Erros</th>
                  <th className="pb-2 text-right font-normal">Acertos</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topTopics.map((t) => (
                  <tr key={t.topicId} className="border-t border-line-soft">
                    <td className="py-2.5">
                      <Link href={`/caderno-de-erros?assunto=${t.topicId}&situacao=todos`} className="flex flex-col hover:[&>span:first-child]:underline">
                        <span className="text-base text-fg underline-offset-4">{t.name}</span>
                        <span className="text-sm text-fg-subtle">{t.subjectName}</span>
                      </Link>
                    </td>
                    <td className="numeral py-2.5 text-right text-base text-fg">{t.errors}</td>
                    <td className="numeral py-2.5 text-right text-base text-fg-muted">{formatPercent(t.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-sm text-fg-subtle">Últimos 90 dias.</p>
        </section>
      </div>

      <section aria-labelledby="list-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="list-title">Registros</span>
        </SectionTitle>
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-4" method="get">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            Situação
            <NativeSelect name="situacao" defaultValue={filters.situacao} className="h-9 text-sm">
              <option value="abertos">Em aberto</option>
              <option value="revisados">Revisados</option>
              <option value="todos">Todos</option>
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            Disciplina
            <NativeSelect name="materia" defaultValue={params.materia ?? ""} className="h-9 text-sm">
              <option value="">Todas</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            Motivo
            <NativeSelect name="motivo" defaultValue={params.motivo ?? ""} className="h-9 text-sm">
              <option value="">Todos</option>
              <option value="sem-motivo">Não informado</option>
              {Object.entries(ERROR_REASON_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </label>
          {params.assunto && <input type="hidden" name="assunto" value={params.assunto} />}
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary" size="sm" className="h-9">
              Filtrar
            </Button>
            {(params.materia || params.motivo || params.assunto || params.situacao) && (
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href="/caderno-de-erros">Limpar</Link>
              </Button>
            )}
          </div>
        </form>

        {list.items.length === 0 ? (
          <p className="py-6 text-base text-fg-muted">Nenhum registro neste filtro.</p>
        ) : (
          <ul className="border-t">
            {list.items.map((e) => (
              <ErrorEntryRow
                key={e.id}
                tz={tz}
                entry={{
                  id: e.id,
                  createdAt: e.createdAt.toISOString(),
                  resolved: !!e.resolvedAt,
                  reason: e.reason,
                  note: e.note,
                  subjectName: e.subjectName,
                  topicName: e.topicName,
                  topicId: e.topicId,
                  boardName: e.boardName,
                  questionId: e.questionId,
                  statement: e.statement,
                  figures: e.figures,
                  explanation: e.explanation,
                  selected: e.selected,
                  correct: e.correct,
                  flashcardId: e.flashcardId,
                }}
              />
            ))}
          </ul>
        )}
        <Pagination page={page} pages={list.pages} basePath="/caderno-de-erros" params={{ ...filters }} />
      </section>
    </div>
  );
}
