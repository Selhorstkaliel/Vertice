import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { UseOfficialDateButton } from "@/components/competitions/official-date";
import { requireOnboardedUser } from "@/modules/auth/session";
import { studentEditais } from "@/modules/editais/queries";
import { currentPublishedFields } from "@/modules/editais/published";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { COMPETITION_STATUS_LABEL, EDITAL_DOC_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Editais" };

type TafRow = { prova: string; sexo: string; faixaEtaria: string | null; indice: string; unidade: string };

export default async function StudentEditaisPage({ searchParams }: { searchParams: Promise<{ concurso?: string }> }) {
  const user = await requireOnboardedUser();
  const { concurso } = await searchParams;
  const rows = await studentEditais(user.id);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Editais" />
        <EmptyState
          icon={<FileText />}
          title="Nenhum concurso na sua lista"
          description="Siga um concurso para acompanhar editais, retificações e resultados publicados nos sites oficiais."
          action={
            <Button asChild variant="primary">
              <Link href="/concursos">Ver concursos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const taf = new Map<string, TafRow[]>();
  for (const r of rows) {
    const inForce = await currentPublishedFields(r.catalogId);
    if (Array.isArray(inForce["taf"]?.value)) taf.set(r.catalogId, inForce["taf"]!.value as TafRow[]);
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Editais"
        description="O Vértice acompanha os sites oficiais dos seus concursos. Documento novo chega aqui e nas notificações com o link oficial; datas e conteúdo só mudam no app depois de conferidos pela equipe."
      />
      {rows.map((r) => (
        <section key={r.enrollmentId} id={r.catalogId} aria-labelledby={`ed-${r.enrollmentId}`} className={cn("flex flex-col gap-4 border-t pt-6", concurso === r.catalogId && "rounded-[var(--radius-panel)] bg-surface px-4 pb-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`ed-${r.enrollmentId}`} className="text-lg font-semibold tracking-[-0.01em]">
              {r.name}
              {r.isPrimary && <span className="ml-2 text-sm font-normal text-fg-subtle">Principal</span>}
            </h2>
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">{COMPETITION_STATUS_LABEL[r.status]}</Badge>
              <Badge tone={r.verified ? "positive" : "warning"}>{r.verified ? "Verificado no edital" : "Informação não verificada"}</Badge>
            </span>
          </div>

          {r.keepCustomExamDate && r.examDate && r.customExamDate && (
            <Notice tone="info" title="Data oficial da prova publicada" action={<UseOfficialDateButton competitionId={r.competitionId} />}>
              O edital marca a prova para {formatCalendarDate(r.examDate)}. Você informou {formatCalendarDate(r.customExamDate)}, e essa data continua valendo no seu plano até você escolher a oficial.
            </Notice>
          )}

          <dl className="grid gap-x-8 gap-y-2 text-base sm:grid-cols-2">
            <div>
              <dt className="text-sm text-fg-subtle">Edital oficial</dt>
              <dd>
                {r.editalUrl ? (
                  <a href={r.editalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">
                    Abrir documento <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-fg-muted">Ainda não conferido</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Última verificação dos sites oficiais</dt>
              <dd className="text-fg-muted">{r.lastCheckedAt ? formatDateTime(r.lastCheckedAt, user.profile.timezone) : "Este concurso ainda não tem verificação automática"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-fg-subtle">Páginas oficiais acompanhadas</dt>
              <dd className="flex flex-col gap-0.5">
                {r.officialPages.length === 0 ? (
                  <span className="text-fg-muted">Nenhuma cadastrada.</span>
                ) : (
                  r.officialPages.map((p) => (
                    <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-info hover:underline">
                      {p.url}
                      {!p.automatic && <span className="ml-1 text-fg-subtle">(acompanhada manualmente pela equipe)</span>}
                    </a>
                  ))
                )}
              </dd>
            </div>
            {r.verified && r.sourceNote && <p className="text-sm text-fg-subtle sm:col-span-2">{r.sourceNote}</p>}
          </dl>

          {(taf.get(r.catalogId)?.length ?? 0) > 0 && (
            <details>
              <summary className="cursor-pointer text-base text-fg select-none">Índices do teste físico no edital</summary>
              <table className="mt-2 w-full max-w-2xl text-left text-sm">
                <thead>
                  <tr className="text-fg-subtle">
                    <th className="pb-1 font-normal">Prova</th>
                    <th className="pb-1 font-normal">Sexo</th>
                    <th className="pb-1 font-normal">Faixa etária</th>
                    <th className="pb-1 font-normal">Índice</th>
                  </tr>
                </thead>
                <tbody>
                  {taf.get(r.catalogId)!.map((t, i) => (
                    <tr key={i} className="border-t border-line-soft">
                      <td className="py-1">{t.prova}</td>
                      <td className="py-1">{t.sexo === "AMBOS" ? "Ambos" : t.sexo === "MASCULINO" ? "Masculino" : "Feminino"}</td>
                      <td className="py-1">{t.faixaEtaria ?? "—"}</td>
                      <td className="py-1">
                        {t.indice} {t.unidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-base font-medium">Documentos publicados</h3>
            {r.documents.length === 0 ? (
              <p className="text-sm text-fg-muted">Nenhum documento novo desde que o Vértice passou a acompanhar este concurso.</p>
            ) : (
              <ul className="flex flex-col">
                {r.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-soft py-2">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-base text-fg hover:underline">
                      <span className="truncate">{d.title || d.url}</span>
                      <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" />
                    </a>
                    <span className="flex items-center gap-2 text-sm text-fg-subtle">
                      {EDITAL_DOC_TYPE_LABEL[d.type]}
                      {d.status === "PUBLISHED" ? <Badge tone="positive">Dados conferidos</Badge> : d.type === "EDITAL" || d.type === "RETIFICACAO" ? <Badge tone="warning">Em conferência</Badge> : null}
                      <span>{formatDateTime(d.createdAt, user.profile.timezone)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
