import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, Notice, PageHeader } from "@/components/ui/display";
import { DocumentControls, DocumentReview } from "@/components/admin/edital-review";
import { requireAdmin } from "@/modules/auth/admin";
import { adminDocument } from "@/modules/editais/queries";
import { describeValue } from "@/engines/editais/changes";
import { isFileLink } from "@/engines/editais/links";
import { formatDateTime } from "@/lib/format";
import { EDITAL_DOC_STATUS_LABEL, EDITAL_DOC_TYPE_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Revisão de edital" };

export default async function EditalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const doc = await adminDocument(id);
  if (!doc) notFound();
  const locked = doc.status === "PUBLISHED";
  const typedBy = doc.typedBy === "ia" ? "classificado pela IA" : doc.typedBy === "admin" ? "definido por admin" : "pelas regras";

  return (
    <div className="flex flex-col gap-8">
      <Link href="/admin/editais" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Editais
      </Link>
      <PageHeader title={doc.title || doc.url} description={`${doc.competition.name} · encontrado em ${formatDateTime(doc.createdAt)}${doc.pageCount ? ` · ${doc.pageCount} páginas` : ""}`} />
      <div className="-mt-4 flex flex-wrap items-center gap-3">
        <Badge tone={doc.status === "PUBLISHED" ? "positive" : "outline"}>{EDITAL_DOC_STATUS_LABEL[doc.status]}</Badge>
        <Badge tone="outline">
          {EDITAL_DOC_TYPE_LABEL[doc.type]} ({typedBy})
        </Badge>
        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
          Documento oficial <ExternalLink className="size-3.5" />
        </a>
        <DocumentControls documentId={doc.id} type={doc.type} status={doc.status} hasFile={!!doc.filePath} baseline={doc.baseline} isPdfLink={isFileLink(doc.url)} />
      </div>
      {doc.statusNote && <Notice tone={doc.status === "FAILED" ? "danger" : "neutral"}>{doc.statusNote}</Notice>}
      {locked && doc.extraction?.publishedAt && (
        <Notice tone="positive">
          Publicado em {formatDateTime(doc.extraction.publishedAt)}
          {doc.extraction.reviewedBy ? ` por ${doc.extraction.reviewedBy.name}` : ""}.
        </Notice>
      )}
      {doc.extraction ? (
        <DocumentReview
          documentId={doc.id}
          pdfUrl={doc.filePath ? `/api/admin/editais/${doc.id}/arquivo` : null}
          locked={locked}
          generalIssues={doc.extraction.issues}
          changes={doc.changes.map((c) => ({
            id: c.id,
            label: c.label,
            summary: `${c.label}: ${describeValue(c.field, c.before)} → ${describeValue(c.field, c.after)}`,
            page: c.page,
            quote: c.quote,
            status: c.status,
          }))}
          fields={Object.entries(doc.fields).map(([key, f]) => ({ key, ...f }))}
        />
      ) : (
        <p className="text-base text-fg-muted">
          {doc.filePath
            ? "Ainda não lido. Use “Ler com IA” ou rode npm run editais -- continuar."
            : isFileLink(doc.url)
              ? "Sem arquivo guardado. Use “Baixar arquivo” para trazer o PDF oficial e depois “Ler com IA”."
              : "Sem arquivo: este documento gera só o aviso com o link. Para ler os dados, envie o PDF pelo envio manual."}
        </p>
      )}
    </div>
  );
}
