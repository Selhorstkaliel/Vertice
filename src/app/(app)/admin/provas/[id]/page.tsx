import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { DraftReview } from "@/components/admin/draft-review";
import { FilterLinks } from "@/components/admin/filter-links";
import { ApproveCleanButton, AutoRefresh, DeletePaperButton, StartExtractionButton } from "@/components/admin/paper-controls";
import { requireAdmin } from "@/modules/auth/admin";
import { questionAiConfigured } from "@/modules/ai/gemini";
import { DRAFT_FILTERS, getPaperReview, parseDraftFilter } from "@/modules/exam-papers/queries";
import { paperStatus } from "@/modules/exam-papers/format";

export const metadata: Metadata = { title: "Revisão da prova" };

export default async function PaperReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filtro?: string; questao?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const opened = Number(sp.questao);
  const filter = sp.questao && !sp.filtro ? "todas" : parseDraftFilter(sp.filtro);
  const review = await getPaperReview(id, filter);
  if (!review) notFound();
  const { paper, drafts, counts, catalog } = review;
  const status = paperStatus(paper);
  const canRead = !paper.running && paper.status !== "PUBLISHED" && (paper.status !== "REVIEW" || paper.extractedUpTo < (paper.expectedCount ?? Infinity));

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={paper.running} />
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title={paper.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span>
              Lidas {paper.extractedUpTo} de {paper.expectedCount ?? "?"}
            </span>
            {paper.layout.length > 0 && <span>· {paper.layout.map((s) => `${s.subject} ${s.from}–${s.to}`).join(", ")}</span>}
            <span>· {paper.aiRequests} pedidos à IA</span>
          </span>
        }
      />
      <div className="-mt-2 flex flex-wrap gap-2">
        {canRead && questionAiConfigured() && <StartExtractionButton paperId={paper.id} label={paper.status === "UPLOADED" ? "Ler prova" : "Retomar leitura"} />}
        <ApproveCleanButton filter={{ examPaperId: paper.id }} count={counts.prontas} />
        {counts.publicadas === 0 && !paper.running && <DeletePaperButton paperId={paper.id} title={paper.title} />}
      </div>

      <div className="flex flex-col gap-2">
        {paper.running && <Notice tone="info">A IA está lendo a prova. As questões aparecem aqui conforme cada lote termina.</Notice>}
        {paper.statusNote && !paper.running && <Notice tone={paper.status === "FAILED" ? "danger" : "warning"}>{paper.statusNote}</Notice>}
        {!paper.hasAnswerKey && <Notice tone="warning">Esta prova não tem gabarito oficial anexado. Cada resposta precisa ser conferida à mão.</Notice>}
        {paper.keyNote && <Notice tone="warning">{paper.keyNote}</Notice>}
        {paper.answerKeyKind === "PRELIMINAR" && <Notice tone="warning">O gabarito anexado é preliminar. Troque pelo definitivo antes de publicar, se já saiu.</Notice>}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-subtle">
          {paper.sourceUrl && (
            <a href={paper.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              PDF oficial <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
          {paper.answerKeyUrl && (
            <a href={paper.answerKeyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              Gabarito oficial <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </p>
      </div>

      <FilterLinks base={`/admin/provas/${paper.id}`} current={filter} filters={DRAFT_FILTERS} counts={counts} />

      {drafts.length === 0 ? (
        <EmptyState
          title={filter === "pendentes" ? "Nada para revisar" : "Nenhuma questão neste filtro"}
          description={paper.running ? "As questões aparecem assim que o primeiro lote for lido." : filter === "pendentes" ? "Todas as questões lidas desta prova já foram revisadas." : "Escolha outro filtro acima."}
        />
      ) : (
        <div className="flex flex-col">
          {drafts.map((d) => (
            <DraftReview key={d.id} draft={d} catalog={catalog} pageCount={paper.pages} defaultOpen={d.number === opened} />
          ))}
        </div>
      )}
    </div>
  );
}
