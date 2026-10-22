import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { DraftReview } from "@/components/admin/draft-review";
import { FilterLinks } from "@/components/admin/filter-links";
import { GenerateForm } from "@/components/admin/generate-form";
import { ApproveCleanButton } from "@/components/admin/paper-controls";
import { requireAdmin } from "@/modules/auth/admin";
import { questionAiConfigured, documentAiSetupHint } from "@/modules/ai/documents";
import { DRAFT_FILTERS, getGeneratedReview, parseDraftFilter } from "@/modules/exam-papers/queries";

export const metadata: Metadata = { title: "Questões geradas" };

export default async function GeneratedQuestionsPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await requireAdmin();
  const filter = parseDraftFilter((await searchParams).filtro);
  const { drafts, counts, competitions, catalogs } = await getGeneratedReview(filter, null);
  const aiReady = questionAiConfigured();

  return (
    <div className="flex flex-col gap-8">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Questões geradas"
        description="Questões inéditas no estilo de cada prova, escritas com IA a partir das questões oficiais publicadas. Os alunos as veem marcadas como geradas por IA, nunca como oficiais."
        actions={<ApproveCleanButton filter={{ origin: "GENERATED" }} count={counts.prontas} />}
      />
      {!aiReady && <Notice tone="warning">{documentAiSetupHint()}</Notice>}

      <section aria-labelledby="gerar">
        <SectionTitle>
          <span id="gerar">Gerar no estilo da prova</span>
        </SectionTitle>
        <GenerateForm competitions={competitions} aiReady={aiReady} />
      </section>

      <section aria-labelledby="revisar" className="flex flex-col gap-4">
        <SectionTitle className="mb-0">
          <span id="revisar">Revisão</span>
        </SectionTitle>
        <FilterLinks base="/admin/geradas" current={filter} filters={DRAFT_FILTERS} counts={counts} />
        {drafts.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="Nenhuma questão neste filtro" description="As questões geradas aparecem aqui para revisão antes de chegar aos alunos." />
        ) : (
          <div className="flex flex-col">
            {drafts.map((d) => (
              <DraftReview key={d.id} draft={d} catalog={catalogs[d.competitionId] ?? []} pageCount={null} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
