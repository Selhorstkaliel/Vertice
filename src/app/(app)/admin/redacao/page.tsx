import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { CollectBatchButton, GenerateThemesForm, OfficialThemeForm, PublishRubricButton, RubricForm, ThemeReviewButtons } from "@/components/admin/essay-admin";
import { requireAdmin } from "@/modules/auth/admin";
import { essayAiConfigured, essayModel, essayProviderLabel } from "@/modules/ai/structured";
import { parseCriteria, parseSupportTexts } from "@/modules/essays/service";
import { essaysEnabled } from "@/lib/plan-limits";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ESSAY_THEME_STATUS_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Redação: rubricas e temas" };

export default async function EssayAdminPage({ searchParams }: { searchParams: Promise<{ rubrica?: string; temas?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const themeFilter = sp.temas === "publicados" ? "PUBLISHED" : sp.temas === "rejeitados" ? "REJECTED" : "DRAFT";
  const [competitions, rubrics, themes, batches] = await Promise.all([
    db.competition.findMany({ where: { ownerId: null, forkedFromId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.essayRubric.findMany({ include: { competition: { select: { name: true } } }, orderBy: [{ competitionId: "asc" }, { year: "desc" }] }),
    db.essayTheme.findMany({ where: { status: themeFilter }, include: { competition: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.essayThemeBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const editing = sp.rubrica ? rubrics.find((r) => r.id === sp.rubrica) : undefined;
  const withRubric = competitions.filter((c) => rubrics.some((r) => r.competitionId === c.id && r.publishedAt));
  const aiReady = essayAiConfigured();

  return (
    <div className="flex flex-col gap-10">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Redação: rubricas e temas"
        description="A correção só é oferecida com rubrica publicada. Temas gerados por IA ficam em rascunho até serem revisados aqui."
      />
      <Notice tone={essaysEnabled() ? "info" : "warning"} title={essaysEnabled() ? "Área de redação ligada para os alunos" : "Área de redação desligada para os alunos"}>
        {essaysEnabled()
          ? "ESSAYS_ENABLED está ativo (ou o servidor está em desenvolvimento)."
          : "Ligue com ESSAYS_ENABLED=on depois que a calibração (npm run redacao:calibrar) passar do limite definido. Administradores sempre veem a área."}{" "}
        IA: {essayProviderLabel()}. Correção: {essayModel("correction")}; reescrita: {essayModel("rewrite")}; temas: {essayModel("theme")}.
        {admin.isAdmin && !aiReady ? " A IA da redação não está configurada (chave ausente ou, em produção, Gemini sem GEMINI_PAID_TIER=on)." : ""}
      </Notice>

      <section aria-labelledby="rubrics-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="rubrics-title">Rubricas</span>
        </SectionTitle>
        {rubrics.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhuma rubrica. Cadastre os critérios exatamente como estão no edital, com o link.</p>
        ) : (
          <ul className="flex flex-col border-t">
            {rubrics.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-2.5">
                <span className="flex flex-col">
                  <span className="text-base text-fg">
                    {r.competition.name} {r.year ?? "(ano não informado)"}
                  </span>
                  <span className="text-sm text-fg-subtle">
                    {parseCriteria(r.criteria).length} critérios, {r.textType}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={r.verified ? "positive" : "warning"}>{r.verified ? "Verificada" : "Não verificada"}</Badge>
                  <Badge tone={r.publishedAt ? "info" : "outline"}>{r.publishedAt ? "Publicada" : "Rascunho"}</Badge>
                  <Link href={`/admin/redacao?rubrica=${r.id}`} className="text-sm text-info hover:underline">
                    Editar
                  </Link>
                  <PublishRubricButton id={r.id} published={!!r.publishedAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="pt-2 text-base font-medium">{editing ? `Editar: ${editing.competition.name} ${editing.year ?? ""}` : "Nova rubrica"}</h3>
        <RubricForm
          key={editing?.id ?? "new"}
          competitions={competitions}
          initial={
            editing
              ? {
                  id: editing.id,
                  competitionId: editing.competitionId,
                  year: editing.year,
                  editalUrl: editing.editalUrl ?? "",
                  textType: editing.textType,
                  minLines: editing.minLines,
                  maxLines: editing.maxLines,
                  charsPerLine: editing.charsPerLine,
                  criteria: parseCriteria(editing.criteria),
                  zeroingRules: editing.zeroingRules,
                  verified: editing.verified,
                }
              : undefined
          }
        />
      </section>

      <section aria-labelledby="themes-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="themes-title">Temas</span>
        </SectionTitle>
        {withRubric.length > 0 ? <GenerateThemesForm competitions={withRubric} aiReady={aiReady} /> : <p className="text-sm text-fg-subtle">Publique uma rubrica para gerar temas.</p>}
        {batches.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-fg-muted">
            {batches.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                Lote de {formatDateTime(b.createdAt)}: {b.collectedAt ? "resultados recebidos" : b.status}
                {!b.collectedAt && <CollectBatchButton id={b.id} />}
              </li>
            ))}
          </ul>
        )}
        <nav className="flex gap-3 text-sm" aria-label="Filtrar temas">
          {[
            ["", "Aguardando revisão"],
            ["publicados", "Publicados"],
            ["rejeitados", "Rejeitados"],
          ].map(([k, l]) => (
            <Link key={k} href={`/admin/redacao${k ? `?temas=${k}` : ""}`} className={(sp.temas ?? "") === k ? "font-medium text-fg" : "text-fg-subtle hover:text-fg"}>
              {l}
            </Link>
          ))}
        </nav>
        {themes.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhum tema em “{ESSAY_THEME_STATUS_LABEL[themeFilter]}”.</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {themes.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-fg">{t.title}</span>
                    <Badge tone={t.origin === "OFFICIAL" ? "outline" : "info"}>{t.origin === "OFFICIAL" ? `Oficial ${t.year ?? ""}` : `Gerado por IA (${t.aiModel ?? "modelo não registrado"})`}</Badge>
                    <span className="text-sm text-fg-subtle">{t.competition.name}</span>
                  </span>
                  <ThemeReviewButtons id={t.id} status={t.status} />
                </div>
                {t.reviewNote && <Notice tone="warning">{t.reviewNote}</Notice>}
                <p className="whitespace-pre-line text-base text-fg-muted">{t.prompt}</p>
                <ul className="flex flex-col gap-1 text-sm text-fg-subtle">
                  {parseSupportTexts(t.supportTexts).map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.title || `Texto ${i + 1}`}:</span> {s.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="official-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="official-title">Cadastrar tema oficial</span>
        </SectionTitle>
        <p className="-mt-2 text-sm text-fg-subtle">Temas de provas anteriores, transcritos da prova, com ano e fonte dos textos de apoio. Servem de referência de estilo para os temas gerados.</p>
        <OfficialThemeForm competitions={competitions} />
      </section>
    </div>
  );
}
