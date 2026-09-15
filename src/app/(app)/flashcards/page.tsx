import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Metric, PageHeader } from "@/components/ui/display";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination, pageFrom } from "@/components/ui/pagination";
import { FlashcardFormDialog } from "@/components/flashcards/flashcard-form-dialog";
import { requireOnboardedUser } from "@/modules/auth/session";
import { flashcardStats, listFlashcards, type FlashcardFilters } from "@/modules/flashcards/service";
import { getAuthoringOptions } from "@/modules/questions/queries";
import { FLASHCARD_TYPE_LABEL } from "@/lib/labels";
import { formatDateShort, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Flashcards" };

const STATE_LABEL = { NEW: "Novo", LEARNING: "Em aprendizagem", RELEARNING: "Reaprendizagem", REVIEW: "Em revisão" } as const;

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<FlashcardFilters & { pagina?: string }> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const tz = user.profile.timezone;
  const page = pageFrom(params.pagina);
  const filters: FlashcardFilters = { q: params.q, materia: params.materia, banca: params.banca, tipo: params.tipo, estado: params.estado, tag: params.tag };
  const [stats, list, options] = await Promise.all([flashcardStats(user.id, tz), listFlashcards(user.id, tz, filters, page), getAuthoringOptions(user.id)]);
  const now = Date.now();
  const reviewHref = `/flashcards/revisar${params.materia || params.banca ? `?${new URLSearchParams({ ...(params.materia ? { materia: params.materia } : {}), ...(params.banca ? { banca: params.banca } : {}) })}` : ""}`;
  const formDialog = <FlashcardFormDialog subjects={options.subjects} boards={options.boards} competitions={options.competitions} />;

  if (stats.total === 0) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Flashcards" actions={formDialog} />
        <EmptyState
          icon={<Layers />}
          title="Você ainda não possui flashcards"
          description="Crie um manualmente ou transforme uma questão em flashcard. As revisões são agendadas por repetição espaçada."
          action={
            <>
              {formDialog}
              <Button asChild variant="ghost">
                <Link href="/questoes">Ir para as questões</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Flashcards"
        description="Revisão por repetição espaçada: cada resposta define, de forma calculada, quando o cartão volta."
        actions={
          <>
            {formDialog}
            <Button asChild variant="primary" disabled={stats.dueToday === 0}>
              <Link href={reviewHref}>Revisar agora{stats.dueToday > 0 ? ` (${stats.dueToday})` : ""}</Link>
            </Button>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-6 border-y py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Pendentes hoje" value={formatNumber(stats.dueToday)} />
        <Metric label="Revisados hoje" value={formatNumber(stats.reviewedToday)} />
        <Metric label="Novos" value={formatNumber(stats.fresh)} detail="Até 20 introduzidos por dia" />
        <Metric label="Em aprendizagem" value={formatNumber(stats.learning)} />
        <Metric label="Em revisão" value={formatNumber(stats.review)} />
        <Metric
          label="Retenção em 30 dias"
          value={formatPercent(stats.retention)}
          detail={stats.retention === null ? "Mínimo de 10 revisões" : `${stats.retentionSample} revisões`}
        />
      </dl>

      <form method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="col-span-2 flex flex-col gap-1 text-xs text-fg-subtle sm:col-span-1 lg:col-span-2">
          Buscar
          <Input name="q" defaultValue={params.q} className="h-9 text-sm" placeholder="Frente ou verso" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          Disciplina
          <NativeSelect name="materia" defaultValue={params.materia ?? ""} className="h-9 text-sm">
            <option value="">Todas</option>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          Banca
          <NativeSelect name="banca" defaultValue={params.banca ?? ""} className="h-9 text-sm">
            <option value="">Todas</option>
            {options.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          Tipo
          <NativeSelect name="tipo" defaultValue={params.tipo ?? ""} className="h-9 text-sm">
            <option value="">Todos</option>
            {Object.entries(FLASHCARD_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          Estado
          <NativeSelect name="estado" defaultValue={params.estado ?? ""} className="h-9 text-sm">
            <option value="">Todos</option>
            <option value="pendentes">Pendentes hoje</option>
            <option value="novos">Novos</option>
            <option value="aprendizagem">Em aprendizagem</option>
            <option value="revisao">Em revisão</option>
            <option value="suspensos">Suspensos</option>
          </NativeSelect>
        </label>
        {params.tag && <input type="hidden" name="tag" value={params.tag} />}
        <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-6">
          <Button type="submit" size="sm" variant="secondary">
            Filtrar
          </Button>
          {Object.values(filters).some(Boolean) && (
            <Button asChild size="sm" variant="ghost">
              <Link href="/flashcards">Limpar</Link>
            </Button>
          )}
          <span className="ml-auto text-sm text-fg-subtle">
            {formatNumber(list.total)} {list.total === 1 ? "cartão" : "cartões"}
          </span>
        </div>
      </form>

      {list.items.length === 0 ? (
        <p className="py-6 text-base text-fg-muted">Nenhum flashcard neste filtro.</p>
      ) : (
        <ul className="border-t">
          {list.items.map((c) => {
            const due = !c.suspended && c.dueAt.getTime() <= now;
            return (
              <li key={c.id} className="border-b border-line-soft">
                <Link href={`/flashcards/${c.id}`} className={cn("group flex flex-col gap-1.5 py-3.5 hover:bg-surface/50 sm:flex-row sm:items-center sm:gap-6", c.suspended && "opacity-60")}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="line-clamp-1 text-base text-fg group-hover:underline group-hover:underline-offset-4">{c.front}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-fg-subtle">
                      <span>{FLASHCARD_TYPE_LABEL[c.type]}</span>
                      {c.subject && <span>{c.subject.name}{c.topic ? ` › ${c.topic.name}` : ""}</span>}
                      {c.examBoard && <span>{c.examBoard.name}</span>}
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.isBoardPattern && <Badge tone="outline">Padrão de cobrança</Badge>}
                    {c.suspended ? <Badge tone="outline">Suspenso</Badge> : due ? <Badge tone="warning">Pendente</Badge> : null}
                    <span className="w-36 text-right text-sm text-fg-subtle">
                      {STATE_LABEL[c.state]}
                      {c.state !== "NEW" && !c.suspended ? `, ${formatDateShort(c.dueAt, tz)}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} pages={list.pages} basePath="/flashcards" params={{ ...filters }} />
    </div>
  );
}
