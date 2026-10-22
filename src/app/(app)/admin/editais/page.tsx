import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { FilterLinks } from "@/components/admin/filter-links";
import { ManualUploadForm, SourceControls } from "@/components/admin/edital-review";
import { requireAdmin } from "@/modules/auth/admin";
import { adminEditaisOverview, DOC_FILTERS, parseDocFilter } from "@/modules/editais/queries";
import { editalAiConfigured } from "@/modules/editais/read";
import { formatDateTime } from "@/lib/format";
import { EDITAL_DOC_STATUS_LABEL, EDITAL_DOC_TYPE_LABEL } from "@/lib/labels";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Editais" };

const KIND_LABEL = { LINK_LIST: "Lista de documentos", INDEX: "Índice de concursos", BROWSER_ONLY: "Só no navegador (envio manual)" } as const;

export default async function AdminEditaisPage({ searchParams }: { searchParams: Promise<{ filtro?: string; concurso?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = parseDocFilter(sp.filtro);
  const data = await adminEditaisOverview(filter, sp.concurso);
  const base = `/admin/editais${sp.concurso ? `?concurso=${sp.concurso}` : ""}`;

  return (
    <div className="flex flex-col gap-10">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Editais"
        description="Documentos encontrados nas fontes oficiais. O aluno recebe na hora só o título e o link; datas, etapas e conteúdo vão para o concurso depois da revisão aqui."
      />

      {(data.alerts.failing.length > 0 || data.alerts.failedReads > 0) && (
        <Notice tone="warning" title="Fontes e leituras com problema">
          <ul className="mt-1 flex flex-col gap-1">
            {data.alerts.failing.map((s) => (
              <li key={s.id}>
                {s.needsAttention ? <strong>Precisa de atenção: </strong> : null}
                {s.competition.name}: {s.consecutiveFailures} {s.consecutiveFailures === 1 ? "falha" : "falhas seguidas"}. {s.lastError} ({s.url})
              </li>
            ))}
            {data.alerts.failedReads > 0 && (
              <li>
                <Link href="/admin/editais?filtro=falhas" className="underline">
                  {data.alerts.failedReads} leituras falharam
                </Link>
              </li>
            )}
          </ul>
        </Notice>
      )}
      {!editalAiConfigured() && <Notice tone="info">Conecte a IA para ler editais. No modo pessoal: Admin › Conexão de IA (/admin/ia). Com Gemini: configure GEMINI_API_KEY e EDITAL_AI_MODELS. A verificação e os avisos com link funcionam sem IA.</Notice>}

      <section aria-labelledby="docs-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="docs-title">Documentos</span>
        </SectionTitle>
        <form className="flex items-center gap-2" action="/admin/editais">
          <input type="hidden" name="filtro" value={filter} />
          <select name="concurso" defaultValue={sp.concurso ?? ""} className="h-9 rounded-[var(--radius-control)] bg-canvas-2 px-2 text-sm shadow-[inset_0_0_0_1px_var(--line)]" aria-label="Concurso">
            <option value="">Todos os concursos</option>
            {data.competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="text-sm text-info hover:underline">
            Filtrar
          </button>
        </form>
        <FilterLinks base={base} current={filter} filters={DOC_FILTERS.map(({ value, label }) => ({ value, label }))} counts={data.counts} />
        {data.documents.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhum documento neste filtro.</p>
        ) : (
          <ul className="flex flex-col border-t">
            {data.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-2.5">
                <Link href={`/admin/editais/${d.id}`} className="flex min-w-0 flex-1 flex-col hover:[&>span:first-child]:underline">
                  <span className="truncate text-base text-fg underline-offset-4">{d.title || d.url}</span>
                  <span className="text-sm text-fg-subtle">
                    {d.competition.name} · {EDITAL_DOC_TYPE_LABEL[d.type]} · encontrado em {formatDateTime(d.createdAt)}
                    {d.statusNote ? ` · ${d.statusNote}` : ""}
                  </span>
                </Link>
                <span className="flex items-center gap-2">
                  {d.issueCount > 0 && <Badge tone="warning">{d.issueCount} pendências</Badge>}
                  {d._count.changes > 0 && <Badge tone="info">{d._count.changes} mudanças</Badge>}
                  <Badge tone={d.status === "PUBLISHED" ? "positive" : d.status === "FAILED" ? "danger" : "outline"}>{EDITAL_DOC_STATUS_LABEL[d.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upload-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="upload-title">Envio manual</span>
        </SectionTitle>
        <p className="-mt-2 max-w-3xl text-sm text-fg-subtle">
          Para sites que só abrem no navegador (Marinha, FAB, Cebraspe, portal da Cesgranrio): baixe o PDF no navegador e envie aqui com o link oficial.
        </p>
        <ManualUploadForm competitions={data.competitions} />
      </section>

      <section aria-labelledby="sources-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="sources-title">Fontes</span>
        </SectionTitle>
        <p className="-mt-2 text-sm text-fg-subtle">
          Lista em prisma/fontes-editais.json (npm run editais -- fontes). Intervalo mínimo entre verificações: {env.EDITAIS_MIN_INTERVAL_HOURS} h. Alerta depois de{" "}
          {env.EDITAIS_FAILURES_ALERT} falhas seguidas.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left">
            <thead>
              <tr className="text-sm text-fg-subtle">
                <th className="pb-2 font-normal">Concurso</th>
                <th className="pb-2 font-normal">Fonte</th>
                <th className="pb-2 font-normal">Última verificação</th>
                <th className="pb-2 font-normal">Último documento novo</th>
                <th className="pb-2 font-normal">Falhas</th>
                <th className="pb-2 font-normal">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id} className="border-t border-line-soft align-top">
                  <td className="py-2 text-sm text-fg">{s.competition.name}</td>
                  <td className="py-2 text-sm">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-info hover:underline">
                      {s.url}
                    </a>
                    <span className="block text-fg-subtle">
                      {KIND_LABEL[s.kind]}
                      {s.active ? "" : " · inativa"} · {s._count.documents} documentos
                    </span>
                    {s.lastError && <span className="block text-warning">{s.lastError}</span>}
                  </td>
                  <td className="py-2 text-sm text-fg-muted">{s.lastCheckedAt ? formatDateTime(s.lastCheckedAt) : "Nunca"}</td>
                  <td className="py-2 text-sm text-fg-muted">{s.lastNewDocumentAt ? formatDateTime(s.lastNewDocumentAt) : "—"}</td>
                  <td className="py-2 text-sm text-fg-muted">{s.consecutiveFailures}</td>
                  <td className="py-2">
                    <SourceControls sourceId={s.id} active={s.active} checkable={s.kind !== "BROWSER_ONLY"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
