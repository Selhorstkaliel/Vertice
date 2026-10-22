import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, PageHeader, SectionTitle } from "@/components/ui/display";
import { CatalogStageItemForm, RemoveCatalogItemButton } from "@/components/admin/stage-item-form";
import { requireAdmin } from "@/modules/auth/admin";
import { db } from "@/lib/db";
import { dbDateToKey } from "@/lib/time";
import { formatDayKey } from "@/lib/format";
import { STAGE_ITEM_KIND_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Itens das etapas" };

export default async function StageItemsAdminPage({ searchParams }: { searchParams: Promise<{ concurso?: string }> }) {
  await requireAdmin();
  const { concurso } = await searchParams;
  const competitions = await db.competition.findMany({ where: { ownerId: null, forkedFromId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const selected = competitions.find((c) => c.id === concurso) ?? competitions[0];
  const [stages, editais] = selected
    ? await Promise.all([
        db.competitionStage.findMany({ where: { competitionId: selected.id }, orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } }),
        db.editalDocument.findMany({
          where: { competitionId: selected.id, type: { in: ["EDITAL", "RETIFICACAO"] }, status: { in: ["NEW", "READING", "REVIEW", "PUBLISHED", "FAILED"] } },
          select: { id: true, title: true, status: true, publishedAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      ])
    : [[], []];
  const EDITAL_STATUS: Record<string, string> = { NEW: "na fila de leitura", READING: "sendo lido", REVIEW: "lido, esperando sua revisão", PUBLISHED: "publicado: itens aplicados", FAILED: "leitura falhou" };

  return (
    <div className="flex flex-col gap-8">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Itens das etapas"
        description="Documentos, exames da inspeção de saúde e as datas de cada etapa vêm do edital real: a busca automática lê o cronograma de cada etapa e, ao publicar o edital revisado em Editais, cada evento vira um item com o prazo e o link do edital. Os itens são copiados para os alunos inscritos na próxima visita às etapas."
      />
      <nav aria-label="Concursos" className="flex flex-wrap gap-1.5">
        {competitions.map((c) => (
          <Link
            key={c.id}
            href={`/admin/etapas?concurso=${c.id}`}
            aria-current={c.id === selected?.id ? "page" : undefined}
            className={cn("rounded-full px-3 py-1 text-sm", c.id === selected?.id ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg")}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      {selected && (
        <section aria-label="Editais deste concurso" className="flex flex-col gap-2">
          {editais.length === 0 ? (
            <p className="text-base text-fg-muted">Nenhum edital de {selected.name} encontrado ainda pela busca automática. Os itens aparecem aqui quando um edital for lido e publicado.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {editais.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-base">
                  <Link href={`/admin/editais/${e.id}`} className="text-info hover:underline hover:underline-offset-4">{e.title}</Link>
                  <Badge tone={e.status === "PUBLISHED" ? "positive" : e.status === "REVIEW" ? "warning" : e.status === "FAILED" ? "danger" : "neutral"}>{EDITAL_STATUS[e.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {stages.length === 0 ? (
        <p className="text-base text-fg-muted">Este concurso não tem etapas no catálogo.</p>
      ) : (
        stages.map((s) => (
          <section key={s.id} aria-labelledby={`stage-${s.id}`} className="flex flex-col gap-4">
            <SectionTitle>
              <span id={`stage-${s.id}`}>{s.name}</span>
            </SectionTitle>
            {s.items.length > 0 && (
              <ul className="flex flex-col border-t">
                {s.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-base">
                    <span className="min-w-0 flex-1 text-fg">
                      {i.title}
                      <span className="ml-2 text-sm text-fg-subtle">
                        {STAGE_ITEM_KIND_LABEL[i.kind]}
                        {i.dueDate ? `, até ${formatDayKey(dbDateToKey(i.dueDate), "dayMonth")}` : ""}
                        {i.sourceUrl ? (
                          <>
                            {" · "}
                            <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="text-info hover:underline hover:underline-offset-4">edital</a>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <Badge tone={i.verification === "VERIFIED" ? "positive" : "warning"}>
                      {VERIFICATION_LABEL[i.verification]}
                      {i.sourceYear ? ` (${i.sourceYear})` : ""}
                    </Badge>
                    <RemoveCatalogItemButton itemId={i.id} title={i.title} />
                  </li>
                ))}
              </ul>
            )}
            <details className="group">
              <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">Adicionar item manualmente (quando o edital não traz)</summary>
              <div className="mt-3">
                <CatalogStageItemForm stageId={s.id} stageName={s.name} />
              </div>
            </details>
          </section>
        ))
      )}
    </div>
  );
}
