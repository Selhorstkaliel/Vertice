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
  const stages = selected
    ? await db.competitionStage.findMany({ where: { competitionId: selected.id }, orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } })
    : [];

  return (
    <div className="flex flex-col gap-8">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Itens das etapas"
        description="Documentos, exames da inspeção de saúde e prazos de cada etapa, sempre com o link do edital. Sem conferência, o aluno vê “Informação não verificada”. Os itens são copiados para os alunos inscritos na próxima visita às etapas."
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
            <CatalogStageItemForm stageId={s.id} stageName={s.name} />
          </section>
        ))
      )}
    </div>
  );
}
