"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ImagePlus, Scissors, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { RichText, figureUrl } from "@/components/questions/rich-text";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { removeFigureAction, saveDraftAction, setDraftStatusAction } from "@/modules/exam-papers/actions";
import type { ReviewCatalog, ReviewDraft } from "@/modules/exam-papers/queries";
import { CropDialog } from "./crop-dialog";

const LABELS = ["A", "B", "C", "D", "E"];
const STATUS = { PENDING: { label: "A revisar", tone: "warning" }, APPROVED: { label: "Publicada", tone: "positive" }, REJECTED: { label: "Rejeitada", tone: "neutral" } } as const;
const CONFIDENCE = { HIGH: "alta", MEDIUM: "média", LOW: "baixa" } as const;

function initialState(draft: ReviewDraft) {
  const byLabel = new Map(draft.options.map((o) => [o.label, o.text]));
  const count = Math.max(draft.options.length, 2);
  return {
    statement: draft.statement,
    options: LABELS.slice(0, Math.max(count, 5)).map((label) => ({ label, text: byLabel.get(label) ?? "" })),
    correctLabel: draft.correctLabel ?? "",
    explanation: draft.explanation ?? "",
    subjectId: draft.subjectId ?? "",
    topicId: draft.topicId ?? "",
    difficulty: draft.difficulty ?? "",
    figureDescriptions: draft.figures.map((f) => f.description),
  };
}

function Verification({ draft }: { draft: ReviewDraft }) {
  const v = draft.verification;
  if (draft.origin === "GENERATED") {
    return (
      <p className="text-sm text-fg-subtle">
        Gerada por {draft.aiModel}. Resposta do gerador: {v.generatorAnswer ?? "nenhuma"}. Verificação independente ({v.solverModel ?? "IA"}): {v.solverAnswer ?? "sem resposta"}
        {v.confidence ? `, confiança ${CONFIDENCE[v.confidence]}` : ""}.
        {v.closestExample ? ` Semelhança com a questão oficial mais próxima: ${Math.round(v.closestExample.overlap * 100)}%.` : ""}
      </p>
    );
  }
  if (!v.model) return <p className="text-sm text-fg-subtle">Transcrita por {draft.aiModel}. Resolução ainda não escrita.</p>;
  return (
    <p className="text-sm text-fg-subtle">
      Transcrita por {draft.aiModel}. Resolução independente da IA: {v.aiAnswer ?? "sem resposta"}
      {v.confidence ? ` (confiança ${CONFIDENCE[v.confidence]})` : ""}
      {draft.keyLabel ? `; gabarito oficial: ${draft.keyLabel}` : ""}.
      {v.explainedFromKey ? " A explicação exibida foi refeita a partir do gabarito." : ""}
    </p>
  );
}

export function DraftReview({ draft, catalog, pageCount, defaultOpen = false }: { draft: ReviewDraft; catalog: ReviewCatalog; pageCount: number | null; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(defaultOpen);
  const [v, setV] = React.useState(() => initialState(draft));
  const [pending, startTransition] = React.useTransition();
  const [crop, setCrop] = React.useState<{ index: number } | null>(null);
  const [uploading, setUploading] = React.useState<number | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const uploadIndex = React.useRef(0);
  const baseId = `rascunho-${draft.id}`;
  const articleRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (defaultOpen) articleRef.current?.scrollIntoView({ block: "start" });
  }, [defaultOpen]);

  // Server data changed (after a save, crop or refresh): start again from it.
  const signature = `${draft.statement}|${JSON.stringify(draft.options)}|${draft.correctLabel}|${draft.explanation}|${draft.subjectId}|${draft.topicId}|${draft.difficulty}|${draft.figures.map((f) => f.description).join("|")}`;
  React.useEffect(() => setV(initialState(draft)), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const subject = catalog.find((s) => s.id === v.subjectId);
  const title = draft.number !== null ? `Questão ${draft.number}` : `Gerada para ${draft.competitionName}`;
  const locked = draft.status === "REJECTED";
  const keyDecides = draft.keyLabel !== null;
  const liveFigures = draft.figures.map((f, i) => ({ file: f.file, description: v.figureDescriptions[i] ?? f.description }));

  const payload = () => ({
    statement: v.statement,
    options: v.options.filter((o) => o.text.trim()),
    correctLabel: keyDecides ? draft.keyLabel : v.correctLabel || null,
    explanation: v.explanation.trim() || null,
    subjectId: v.subjectId || null,
    topicId: v.topicId || null,
    difficulty: (v.difficulty || null) as "EASY" | "MEDIUM" | "HARD" | null,
    figureDescriptions: v.figureDescriptions,
  });

  const save = (approve: boolean) =>
    startTransition(async () => {
      const r = await saveDraftAction(draft.id, payload(), approve);
      if (!r.ok) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.message);
      if (r.data.published) setOpen(false);
      router.refresh();
    });

  const setStatus = (action: "reject" | "restore") =>
    startTransition(async () => {
      const r = await setDraftStatusAction(draft.id, action);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });

  const removeFigure = (index: number) =>
    startTransition(async () => {
      const r = await removeFigureAction(draft.id, index);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });

  const upload = async (file: File) => {
    const index = uploadIndex.current;
    setUploading(index);
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch(`/api/admin/rascunhos/${draft.id}/figuras/${index}`, { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) toast.error(data.error ?? "Não foi possível enviar a imagem.");
      else {
        toast.success("Imagem da figura atualizada.");
        router.refresh();
      }
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const status = STATUS[draft.status];

  return (
    <article ref={articleRef} className="scroll-mt-4 border-b border-line-soft py-5 last:border-b-0" aria-labelledby={`${baseId}-titulo`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`${baseId}-titulo`} className="text-base font-medium text-fg">
            {title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-subtle">
            <Badge tone={status.tone}>{status.label}</Badge>
            {subject && <span>{subject.name}</span>}
            {draft.correctLabel && <span>· Resposta {draft.correctLabel}</span>}
            {draft.figures.length > 0 && <span>· {draft.figures.length === 1 ? "1 figura" : `${draft.figures.length} figuras`}</span>}
            {draft.attempts > 0 && <span>· {draft.attempts} resposta(s) de alunos</span>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${baseId}-corpo`}>
          {open ? "Fechar" : draft.status === "APPROVED" ? "Editar" : "Revisar"}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {draft.issues.length > 0 && draft.status !== "APPROVED" && (
        <ul className="mt-3 flex flex-col gap-1" aria-label="Pendências">
          {draft.issues.map((issue) => (
            <li key={issue} className="flex gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      {!open && (
        <div className="mt-3 max-w-3xl">
          <RichText text={draft.statement} figures={draft.figures} className="line-clamp-4 text-base text-fg-muted [&_img]:hidden" />
        </div>
      )}

      {open && (
        <div id={`${baseId}-corpo`} className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <Field label="Enunciado" htmlFor={`${baseId}-enunciado`} hint="Fórmulas entre $...$. Figuras onde aparecem: [[FIGURA 1]].">
              <Textarea rows={10} value={v.statement} disabled={locked} onChange={(e) => setV({ ...v, statement: e.target.value })} className="font-mono text-sm" />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg-muted">Alternativas</legend>
              {v.options.map((o, i) => (
                <div key={o.label} className="flex items-center gap-2">
                  <span className="w-5 text-sm font-medium text-fg-muted">{o.label}</span>
                  <Input
                    aria-label={`Alternativa ${o.label}`}
                    value={o.text}
                    disabled={locked}
                    onChange={(e) => setV({ ...v, options: v.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                    className="font-mono text-sm"
                  />
                </div>
              ))}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Alternativa correta"
                htmlFor={`${baseId}-resposta`}
                hint={keyDecides ? "Definida pelo gabarito oficial." : draft.origin === "GENERATED" ? "Confira com a verificação independente." : "Esta prova não tem gabarito para esta questão."}
              >
                <NativeSelect value={keyDecides ? (draft.keyLabel ?? "") : v.correctLabel} disabled={locked || keyDecides} onChange={(e) => setV({ ...v, correctLabel: e.target.value })}>
                  <option value="">Escolha</option>
                  {v.options
                    .filter((o) => o.text.trim())
                    .map((o) => (
                      <option key={o.label} value={o.label}>
                        {o.label}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Dificuldade" htmlFor={`${baseId}-dificuldade`} hint="Estimativa; ajuste se discordar.">
                <NativeSelect value={v.difficulty} disabled={locked} onChange={(e) => setV({ ...v, difficulty: e.target.value as typeof v.difficulty })}>
                  <option value="">Média (padrão)</option>
                  {(Object.keys(DIFFICULTY_LABEL) as (keyof typeof DIFFICULTY_LABEL)[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Disciplina" htmlFor={`${baseId}-disciplina`}>
                <NativeSelect value={v.subjectId} disabled={locked} onChange={(e) => setV({ ...v, subjectId: e.target.value, topicId: "" })}>
                  <option value="">Escolha</option>
                  {catalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Tópico" htmlFor={`${baseId}-topico`} optional>
                <NativeSelect value={v.topicId} disabled={locked || !subject} onChange={(e) => setV({ ...v, topicId: e.target.value })}>
                  <option value="">Sem tópico</option>
                  {subject?.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field label="Resolução comentada" htmlFor={`${baseId}-resolucao`} hint="Escrita com IA. Confira cada passo antes de publicar." optional>
              <Textarea rows={8} value={v.explanation} disabled={locked} onChange={(e) => setV({ ...v, explanation: e.target.value })} className="font-mono text-sm" />
            </Field>

            {(draft.figures.length > 0 || (draft.paperId && !locked)) && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-medium text-fg-muted">Figuras</legend>
                {draft.figures.map((f, i) => (
                  <div key={`${i}-${f.file}`} className="flex flex-col gap-2 rounded-[var(--radius-object)] p-3 shadow-[inset_0_0_0_1px_var(--line)] sm:flex-row">
                    <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-white sm:w-40">
                      {f.file ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private figure
                        <img src={figureUrl(f.file)} alt={`Figura ${i + 1}`} className="max-h-28 max-w-full object-contain" />
                      ) : (
                        <span className="text-sm text-neutral-500">Sem imagem</span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input
                        aria-label={`Descrição da figura ${i + 1}, lida por leitores de tela`}
                        placeholder={`Descrição da figura ${i + 1}`}
                        value={v.figureDescriptions[i] ?? ""}
                        disabled={locked}
                        onChange={(e) => setV({ ...v, figureDescriptions: v.figureDescriptions.map((d, j) => (j === i ? e.target.value : d)) })}
                      />
                      {!locked && (
                        <div className="flex flex-wrap gap-1.5">
                          {draft.paperId && (
                            <Button variant="outline" size="sm" onClick={() => setCrop({ index: i })}>
                              <Scissors /> Recortar da prova
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            loading={uploading === i}
                            onClick={() => {
                              uploadIndex.current = i;
                              fileInput.current?.click();
                            }}
                          >
                            <ImagePlus /> Enviar imagem
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeFigure(i)} disabled={pending}>
                            <Trash2 /> Remover
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {draft.paperId && !locked && (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setCrop({ index: draft.figures.length })}>
                      <Scissors /> Adicionar figura {draft.figures.length + 1}
                    </Button>
                  </div>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </fieldset>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-[var(--radius-object)] bg-canvas-2 p-4 shadow-[inset_0_0_0_1px_var(--line)]">
              <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Como o aluno verá</p>
              <RichText text={v.statement} figures={liveFigures} className="text-base leading-relaxed text-fg" />
              <ol className="flex flex-col gap-2">
                {v.options
                  .filter((o) => o.text.trim())
                  .map((o) => {
                    const correct = (keyDecides ? draft.keyLabel : v.correctLabel) === o.label;
                    return (
                      <li key={o.label} className={cn("flex gap-3 rounded-md px-3 py-2 text-base", correct ? "bg-positive/10 text-fg" : "text-fg-muted")}>
                        <span className="font-medium">{o.label}</span>
                        <RichText text={o.text} figures={liveFigures} inline />
                        {correct && <Check className="ml-auto size-4 shrink-0 text-positive" aria-label="correta" />}
                      </li>
                    );
                  })}
              </ol>
              {v.explanation.trim() && (
                <div className="flex flex-col gap-1 border-t border-line-soft pt-3">
                  <p className="text-sm font-medium text-fg-muted">Resolução</p>
                  <RichText text={v.explanation} className="text-sm leading-relaxed text-fg-muted" />
                </div>
              )}
            </div>
            <Verification draft={draft} />
          </div>

          <div className="flex flex-wrap gap-2 lg:col-span-2">
            {draft.status === "REJECTED" ? (
              <Button variant="secondary" onClick={() => setStatus("restore")} loading={pending}>
                <Undo2 /> Voltar para revisão
              </Button>
            ) : draft.status === "APPROVED" ? (
              <Button variant="primary" onClick={() => save(false)} loading={pending}>
                <CheckCircle2 /> Salvar questão publicada
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => save(true)} loading={pending}>
                  <CheckCircle2 /> Publicar no banco
                </Button>
                <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
                  Salvar rascunho
                </Button>
                <Button variant="danger" onClick={() => setStatus("reject")} disabled={pending}>
                  <X /> Rejeitar
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {crop && draft.paperId && (
        <CropDialog
          open
          onOpenChange={(o) => !o && setCrop(null)}
          draftId={draft.id}
          paperId={draft.paperId}
          index={crop.index}
          pageCount={pageCount}
          initialPage={draft.figures[crop.index]?.page ?? draft.figures.at(-1)?.page ?? 1}
          initialBox={draft.figures[crop.index]?.box ?? null}
        />
      )}
    </article>
  );
}
