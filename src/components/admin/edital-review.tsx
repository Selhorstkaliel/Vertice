"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EDITAL_DOC_TYPE_LABEL } from "@/lib/labels";
import {
  announceDocumentAction,
  checkSourceAction,
  downloadDocumentAction,
  ignoreDocumentAction,
  publishDocumentAction,
  readDocumentAction,
  reviewChangeAction,
  reviewFieldAction,
  setDocumentTypeAction,
  setSourceActiveAction,
} from "@/modules/editais/actions";

type Result = { ok: boolean; error?: string; message?: string };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

const STATUS_TONE = { APPROVED: "positive", REJECTED: "danger", PENDING: "warning" } as const;
const STATUS_TEXT = { APPROVED: "Aprovado", REJECTED: "Rejeitado", PENDING: "Pendente" } as const;

export interface FieldView {
  key: string;
  label: string;
  value: unknown;
  page: number | null;
  quote: string | null;
  issues: string[];
  status: "APPROVED" | "REJECTED" | "PENDING";
  edited: boolean;
}

function show(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function FieldReview({ documentId, field, onPage, locked }: { documentId: string; field: FieldView; onPage: (page: number) => void; locked: boolean }) {
  const { pending, run } = useRun();
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(JSON.stringify(field.value, null, 2));
  return (
    <li className={cn("flex flex-col gap-2 border-b border-line-soft py-3", field.issues.length > 0 && field.status === "PENDING" && "bg-warning/5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-base font-medium text-fg">{field.label}</span>
          <Badge tone={STATUS_TONE[field.status]}>{STATUS_TEXT[field.status]}</Badge>
          {field.edited && <Badge tone="outline">Editado</Badge>}
        </span>
        {field.page && (
          <button type="button" className="text-sm text-info hover:underline" onClick={() => onPage(field.page!)}>
            Página {field.page}
          </button>
        )}
      </div>
      {editing ? (
        <Textarea aria-label={`Valor de ${field.label}`} rows={Math.min(14, text.split("\n").length + 1)} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" />
      ) : (
        <pre className="max-h-64 overflow-auto rounded-[var(--radius-control)] bg-canvas-2 px-3 py-2 text-sm whitespace-pre-wrap text-fg">{show(field.value)}</pre>
      )}
      {field.quote && <p className="text-sm text-fg-subtle">Trecho citado: “{field.quote}”</p>}
      {field.issues.map((i) => (
        <p key={i} className="text-sm text-warning">
          {i}
        </p>
      ))}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => reviewFieldAction({ documentId, key: field.key, status: "APPROVED", value: text }), () => setEditing(false))}>
                Salvar e aprovar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => reviewFieldAction({ documentId, key: field.key, status: "APPROVED" }))}>
                Aprovar
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
                Corrigir
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewFieldAction({ documentId, key: field.key, status: "REJECTED" }))}>
                Rejeitar
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ChangeReview({ change, onPage, locked }: { change: { id: string; label: string; summary: string; page: number | null; quote: string | null; status: "APPROVED" | "REJECTED" | "PENDING" }; onPage: (page: number) => void; locked: boolean }) {
  const { pending, run } = useRun();
  return (
    <li className="flex flex-col gap-1.5 border-b border-line-soft py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-base text-fg">
          {change.summary}
          <Badge tone={STATUS_TONE[change.status]}>{STATUS_TEXT[change.status]}</Badge>
        </span>
        {change.page && (
          <button type="button" className="text-sm text-info hover:underline" onClick={() => onPage(change.page!)}>
            Página {change.page}
          </button>
        )}
      </div>
      {change.quote && <p className="text-sm text-fg-subtle">Trecho: “{change.quote}”</p>}
      {!locked && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => reviewChangeAction(change.id, "APPROVED"))}>
            Aprovar mudança
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewChangeAction(change.id, "REJECTED"))}>
            Rejeitar
          </Button>
        </div>
      )}
    </li>
  );
}

/** PDF on one side, fields on the other; clicking a page reference jumps the viewer. */
export function DocumentReview({
  documentId,
  pdfUrl,
  fields,
  changes,
  locked,
  generalIssues,
}: {
  documentId: string;
  pdfUrl: string | null;
  fields: FieldView[];
  changes: { id: string; label: string; summary: string; page: number | null; quote: string | null; status: "APPROVED" | "REJECTED" | "PENDING" }[];
  locked: boolean;
  generalIssues: string[];
}) {
  const [page, setPage] = React.useState(1);
  const { pending, run } = useRun();
  const pendingCount = fields.filter((f) => f.status === "PENDING").length + changes.filter((c) => c.status === "PENDING").length;
  const withIssues = [...fields].sort((a, b) => Number(b.issues.length > 0) - Number(a.issues.length > 0));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        {pdfUrl ? (
          <iframe key={page} title="Documento oficial" src={`${pdfUrl}#page=${page}`} className="h-[80vh] w-full rounded-[var(--radius-panel)] bg-surface" />
        ) : (
          <p className="text-base text-fg-muted">Sem arquivo armazenado.</p>
        )}
      </div>
      <div className="flex flex-col gap-6">
        {generalIssues.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] bg-warning/10 px-4 py-3">
            <p className="text-sm font-medium text-warning">Pendências gerais</p>
            {generalIssues.map((i) => (
              <p key={i} className="text-sm text-fg">
                {i}
              </p>
            ))}
          </div>
        )}
        {changes.length > 0 && (
          <section className="flex flex-col">
            <h2 className="text-md font-semibold">Mudanças em relação ao edital vigente</h2>
            <ul>
              {changes.map((c) => (
                <ChangeReview key={c.id} change={c} onPage={setPage} locked={locked} />
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col">
          <h2 className="text-md font-semibold">Campos extraídos ({fields.length})</h2>
          <p className="text-sm text-fg-subtle">Campos com pendência aparecem primeiro. Só os aprovados vão para o concurso; os demais seguem como “Informação não verificada”.</p>
          <ul>
            {withIssues.map((f) => (
              <FieldReview key={f.key} documentId={documentId} field={f} onPage={setPage} locked={locked} />
            ))}
          </ul>
        </section>
        {!locked && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button variant="primary" loading={pending} disabled={pendingCount > 0} onClick={() => run(() => publishDocumentAction(documentId))}>
              Publicar no concurso
            </Button>
            <span className="text-sm text-fg-subtle">{pendingCount > 0 ? `${pendingCount} itens ainda pendentes.` : "Tudo revisado."}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentControls({ documentId, type, status, hasFile, baseline, isPdfLink }: { documentId: string; type: keyof typeof EDITAL_DOC_TYPE_LABEL; status: string; hasFile: boolean; baseline: boolean; isPdfLink: boolean }) {
  const { pending, run } = useRun();
  const locked = status === "PUBLISHED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Tipo do documento" className="h-9 w-48 text-sm" value={type} disabled={locked || pending} onChange={(e) => run(() => setDocumentTypeAction(documentId, e.target.value as typeof type))}>
        {Object.entries(EDITAL_DOC_TYPE_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
      {hasFile && !locked && (type === "EDITAL" || type === "RETIFICACAO") && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => readDocumentAction(documentId))}>
          {status === "REVIEW" ? "Ler de novo" : "Ler com IA"}
        </Button>
      )}
      {!hasFile && isPdfLink && !locked && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => downloadDocumentAction(documentId))}>
          Baixar arquivo
        </Button>
      )}
      {baseline && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => announceDocumentAction(documentId))}>
          Avisar alunos
        </Button>
      )}
      {!locked && status !== "IGNORED" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => ignoreDocumentAction(documentId))}>
          Ignorar
        </Button>
      )}
    </div>
  );
}

export function SourceControls({ sourceId, active, checkable }: { sourceId: string; active: boolean; checkable: boolean }) {
  const { pending, run } = useRun();
  return (
    <span className="flex gap-1">
      {checkable && active && (
        <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => checkSourceAction(sourceId))}>
          Verificar agora
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setSourceActiveAction(sourceId, !active))}>
        {active ? "Desativar" : "Ativar"}
      </Button>
    </span>
  );
}

export function ManualUploadForm({ competitions }: { competitions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  return (
    <form
      className="grid max-w-3xl gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const res = await fetch("/api/admin/editais", { method: "POST", body: new FormData(e.currentTarget) }).catch(() => null);
        setPending(false);
        const body = (await res?.json().catch(() => ({}))) as { id?: string; duplicate?: boolean; error?: string; fieldErrors?: Record<string, string[]> };
        if (!res?.ok) {
          setErrors(body.fieldErrors ?? {});
          toast.error(body.error ?? "Falha no envio.");
          return;
        }
        toast.success(body.duplicate ? "Este PDF já estava registrado." : "Documento registrado.");
        router.push(`/admin/editais/${body.id}`);
      }}
    >
      <Field label="Concurso" htmlFor="up-comp" error={errors.competitionId}>
        <NativeSelect name="competitionId" defaultValue="">
          <option value="">Escolha</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Título (como no site oficial)" htmlFor="up-title" error={errors.title}>
        <Input name="title" maxLength={300} />
      </Field>
      <Field label="Link oficial do documento" htmlFor="up-url" error={errors.sourceUrl}>
        <Input name="sourceUrl" type="url" placeholder="https://" />
      </Field>
      <Field label="PDF" htmlFor="up-pdf" error={errors.pdf}>
        <Input name="pdf" type="file" accept="application/pdf" />
      </Field>
      <label className="flex items-center gap-2 text-base text-fg sm:col-span-2">
        <input type="checkbox" name="announce" className="size-4" />
        Avisar agora os alunos que seguem o concurso (só título e link)
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" loading={pending}>
          Enviar documento
        </Button>
      </div>
    </form>
  );
}
