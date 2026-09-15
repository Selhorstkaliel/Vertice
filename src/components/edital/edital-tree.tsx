"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { formatDateShort, formatMinutes, formatPercent } from "@/lib/format";
import { TOPIC_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { SubjectNode, TopicNode } from "@/modules/syllabus/queries";
import { setTopicStatusAction } from "@/modules/syllabus/actions";
import { addTopicAction, removeSubjectAction, removeTopicAction, setSubjectWeightAction } from "@/modules/competitions/actions";
import { startSessionAction } from "@/modules/sessions/actions";

type Filter = "all" | "NOT_STUDIED" | "IN_PROGRESS" | "done" | "revisar";

const STATUS_TONE: Record<string, string> = {
  NOT_STUDIED: "bg-line",
  IN_PROGRESS: "bg-warning",
  STUDIED: "bg-info",
  REVIEWED: "bg-positive",
};

function matches(node: TopicNode, filter: Filter, now: number): boolean {
  if (!node.isLeaf) return node.children.some((c) => matches(c, filter, now));
  switch (filter) {
    case "all":
      return true;
    case "done":
      return node.status === "STUDIED" || node.status === "REVIEWED";
    case "revisar":
      return !!node.nextReviewAt && new Date(node.nextReviewAt).getTime() <= now;
    default:
      return node.status === filter;
  }
}

function TopicRow({
  node,
  depth,
  filter,
  now,
  competitionId,
  subjectId,
  editable,
  highlight,
  tz,
}: {
  node: TopicNode;
  depth: number;
  filter: Filter;
  now: number;
  competitionId: string;
  subjectId: string;
  editable: boolean;
  highlight: string | null;
  tz: string;
}) {
  const [open, setOpen] = React.useState(depth === 0 || node.children.some((c) => c.id === highlight));
  const [pending, startTransition] = React.useTransition();
  const [addOpen, setAddOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (highlight === node.id) ref.current?.scrollIntoView({ block: "center" });
  }, [highlight, node.id]);

  if (!matches(node, filter, now)) return null;
  const due = node.nextReviewAt && new Date(node.nextReviewAt).getTime() <= now;

  return (
    <li>
      <div
        ref={ref}
        className={cn(
          "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line-soft py-2.5 pr-1 md:grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)_9rem_auto]",
          highlight === node.id && "bg-surface",
        )}
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {node.isLeaf ? (
            <span aria-hidden="true" className={cn("ml-1.5 size-1.5 shrink-0 rounded-full", STATUS_TONE[node.status])} />
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? `Recolher ${node.name}` : `Expandir ${node.name}`}
              className="rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
            </button>
          )}
          <span className={cn("truncate text-base", node.isLeaf ? "text-fg" : "font-medium text-fg")}>{node.name}</span>
          {node.owned && <Badge tone="outline">Seu</Badge>}
          {due && <Badge tone="warning">Revisar</Badge>}
        </div>

        {/* Mobile summary */}
        <div className="col-span-2 flex flex-wrap gap-x-3 text-sm text-fg-subtle md:hidden" style={{ paddingLeft: "1.25rem" }}>
          <span>{TOPIC_STATUS_LABEL[node.status]}</span>
          {node.answered > 0 && (
            <span>
              {node.correct}/{node.answered} acertos
            </span>
          )}
          {node.flashcards > 0 && <span>{node.flashcards} flashcards</span>}
          {node.nextReviewAt && <span>Próx. revisão {formatDateShort(new Date(node.nextReviewAt), tz)}</span>}
        </div>

        <span className="numeral hidden text-right text-sm text-fg-muted md:block">{node.answered || "—"}</span>
        <span className="numeral hidden text-right text-sm text-fg-muted md:block">{node.answered ? node.answered - node.correct : "—"}</span>
        <span className={cn("numeral hidden text-right text-sm md:block", node.accuracy === null ? "text-fg-subtle" : node.accuracy >= 0.7 ? "text-positive" : node.accuracy >= 0.55 ? "text-warning" : "text-danger")}>
          {formatPercent(node.accuracy)}
        </span>
        <span className="numeral hidden text-right text-sm text-fg-muted md:block">{node.flashcards || "—"}</span>
        <span className="numeral hidden text-right text-sm text-fg-muted md:block">
          {node.nextReviewAt ? formatDateShort(new Date(node.nextReviewAt), tz) : node.lastReviewedAt ? `últ. ${formatDateShort(new Date(node.lastReviewedAt), tz)}` : "—"}
        </span>

        <div className="hidden md:block">
          {node.isLeaf ? (
            <NativeSelect
              aria-label={`Status de ${node.name}`}
              value={node.status}
              disabled={pending}
              className="h-8 text-sm"
              onChange={(e) => {
                const status = e.target.value as TopicNode["status"];
                startTransition(async () => {
                  const r = await setTopicStatusAction(node.id, status);
                  if (!r.ok) toast.error(r.error);
                  else toast.success(r.message);
                });
              }}
            >
              {Object.entries(TOPIC_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <span className="text-sm text-fg-subtle">{TOPIC_STATUS_LABEL[node.status]}</span>
          )}
        </div>

        <div className="row-start-1 flex justify-end md:col-start-8 md:row-start-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`Ações para ${node.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {node.isLeaf && (
                <DropdownMenuItem onSelect={() => startTransition(async () => {
                  const r = await startSessionAction({ topicId: node.id, kind: node.status === "NOT_STUDIED" || node.status === "IN_PROGRESS" ? "NEW_CONTENT" : "REVIEW" });
                  if (r && !r.ok) toast.error(r.error);
                })}>
                  <Play />
                  Iniciar sessão
                </DropdownMenuItem>
              )}
              {node.isLeaf &&
                Object.entries(TOPIC_STATUS_LABEL)
                  .filter(([v]) => v !== node.status)
                  .map(([v, l]) => (
                    <DropdownMenuItem
                      key={v}
                      className="md:hidden"
                      onSelect={() =>
                        startTransition(async () => {
                          const r = await setTopicStatusAction(node.id, v as TopicNode["status"]);
                          if (!r.ok) toast.error(r.error);
                          else toast.success(r.message);
                        })
                      }
                    >
                      Marcar como {l.toLowerCase()}
                    </DropdownMenuItem>
                  ))}
              {editable && !node.isLeaf && (
                <DropdownMenuItem onSelect={() => setAddOpen(true)}>
                  <Plus />
                  Adicionar subtópico
                </DropdownMenuItem>
              )}
              {editable && (
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    startTransition(async () => {
                      const r = await removeTopicAction(competitionId, node.id);
                      if (!r.ok) toast.error(r.error);
                      else toast.success(r.message);
                    })
                  }
                >
                  <Trash2 />
                  Remover do edital
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!node.isLeaf && open && (
        <ul>
          {node.children.map((c) => (
            <TopicRow key={c.id} node={c} depth={depth + 1} filter={filter} now={now} competitionId={competitionId} subjectId={subjectId} editable={editable} highlight={highlight} tz={tz} />
          ))}
        </ul>
      )}
      {editable && <AddTopicDialog open={addOpen} onOpenChange={setAddOpen} competitionId={competitionId} subjectId={subjectId} parentId={node.id} parentName={node.name} />}
    </li>
  );
}

function AddTopicDialog({
  open,
  onOpenChange,
  competitionId,
  subjectId,
  parentId,
  parentName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  competitionId: string;
  subjectId: string;
  parentId: string | null;
  parentName: string;
}) {
  const [name, setName] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={parentId ? "Novo subtópico" : "Novo tópico"} description={parentName}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await addTopicAction(competitionId, { subjectId, name, parentId });
              if (!r.ok) toast.error(r.error);
              else {
                toast.success(r.message);
                setName("");
                onOpenChange(false);
              }
            });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Nome do tópico" autoFocus placeholder="Ex.: Função logarítmica" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Adicionar tópico
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubjectSection({
  subject,
  filter,
  now,
  competitionId,
  editable,
  defaultOpen,
  highlight,
  tz,
}: {
  subject: SubjectNode;
  filter: Filter;
  now: number;
  competitionId: string;
  editable: boolean;
  defaultOpen: boolean;
  highlight: string | null;
  tz: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [addOpen, setAddOpen] = React.useState(false);
  const [weightOpen, setWeightOpen] = React.useState(false);
  const [weight, setWeight] = React.useState(subject.weight?.toString() ?? "");
  const [questions, setQuestions] = React.useState(subject.questionCount?.toString() ?? "");
  const [pending, startTransition] = React.useTransition();
  const visible = subject.topics.filter((t) => matches(t, filter, now));
  const accuracy = subject.answered >= 5 ? subject.correct / subject.answered : null;

  React.useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  return (
    <section className="flex flex-col" id={`materia-${subject.id}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={cn("size-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} />
          <h2 className="truncate text-lg font-semibold tracking-[-0.015em]">{subject.name}</h2>
        </button>
        <div className="flex items-center gap-4 text-sm text-fg-subtle">
          <span>
            {subject.studiedCount}/{subject.leafCount} tópicos
          </span>
          <span>{accuracy === null ? "Sem questões" : `${formatPercent(accuracy)} de acertos`}</span>
          <span>
            {subject.weight !== null ? `Peso ${subject.weight}` : "Peso não informado"}
            {subject.questionCount !== null && `, ${subject.questionCount} questões`}
          </span>
          {subject.verification === "USER_PROVIDED" && subject.weight !== null && <Badge tone="outline">Peso informado por você</Badge>}
        </div>
        <span className="numeral w-12 text-right text-lg text-fg">{formatPercent(subject.coverage)}</span>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`Ações para ${subject.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setAddOpen(true)}>
                <Plus />
                Adicionar tópico
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setWeightOpen(true)}>Definir peso</DropdownMenuItem>
              <DropdownMenuItem
                destructive
                onSelect={() =>
                  startTransition(async () => {
                    const r = await removeSubjectAction(competitionId, subject.id);
                    if (!r.ok) toast.error(r.error);
                    else toast.success(r.message);
                  })
                }
              >
                <Trash2 />
                Remover disciplina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Progress value={subject.coverage} tone="neutral" size="xs" label={`Edital de ${subject.name}`} />
      {open && (
        <div className="pt-2 pb-6">
          <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)_9rem_auto] gap-x-4 border-b py-2 pr-1 text-2xs text-fg-subtle md:grid">
            <span>Tópico</span>
            <span className="text-right">Questões</span>
            <span className="text-right">Erros</span>
            <span className="text-right">Acertos</span>
            <span className="text-right">Flashcards</span>
            <span className="text-right">Revisão</span>
            <span>Status</span>
            <span className="w-8" />
          </div>
          {visible.length === 0 ? (
            <p className="py-4 text-base text-fg-subtle">{subject.topics.length ? "Nenhum tópico neste filtro." : "Nenhum tópico cadastrado."}</p>
          ) : (
            <ul>
              {subject.topics.map((t) => (
                <TopicRow key={t.id} node={t} depth={0} filter={filter} now={now} competitionId={competitionId} subjectId={subject.id} editable={editable} highlight={highlight} tz={tz} />
              ))}
            </ul>
          )}
        </div>
      )}
      {editable && <AddTopicDialog open={addOpen} onOpenChange={setAddOpen} competitionId={competitionId} subjectId={subject.id} parentId={null} parentName={subject.name} />}
      <Dialog open={weightOpen} onOpenChange={setWeightOpen}>
        <DialogContent title="Peso da disciplina" description="Use os valores do edital oficial. Deixe em branco se não houver informação.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await setSubjectWeightAction(competitionId, subject.id, {
                  weight: weight.trim() ? Number(weight.replace(",", ".")) : null,
                  questionCount: questions.trim() ? Number(questions) : null,
                });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message);
                  setWeightOpen(false);
                }
              });
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-muted">
                Peso
                <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ex.: 2" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-muted">
                Nº de questões
                <Input inputMode="numeric" value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="Ex.: 20" />
              </label>
            </div>
            <p className="text-sm text-fg-subtle">Os pesos só entram no cálculo de prioridade quando todas as disciplinas do edital têm peso informado.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setWeightOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Salvar peso
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function EditalTree({
  competitionId,
  subjects,
  editable,
  tz,
  nowIso,
}: {
  competitionId: string;
  subjects: SubjectNode[];
  editable: boolean;
  tz: string;
  nowIso: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initialFilter = (params.get("filtro") as Filter | null) ?? "all";
  const [filter, setFilter] = React.useState<Filter>(["all", "NOT_STUDIED", "IN_PROGRESS", "done", "revisar"].includes(initialFilter) ? initialFilter : "all");
  const focusSubject = params.get("materia");
  const highlight = params.get("topico");
  const now = new Date(nowIso).getTime();
  const highlightSubject = highlight
    ? subjects.find((s) => {
        const has = (n: TopicNode): boolean => n.id === highlight || n.children.some(has);
        return s.topics.some(has);
      })?.id
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Segmented<Filter>
        aria-label="Filtrar tópicos"
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          const next = new URLSearchParams(params);
          if (v === "all") next.delete("filtro");
          else next.set("filtro", v);
          router.replace(`?${next.toString()}`, { scroll: false });
        }}
        options={[
          { value: "all", label: "Todos" },
          { value: "NOT_STUDIED", label: "Não estudados" },
          { value: "IN_PROGRESS", label: "Em andamento" },
          { value: "done", label: "Estudados" },
          { value: "revisar", label: "Revisar" },
        ]}
        className="scrollbar-thin max-w-full self-start overflow-x-auto"
      />
      <div className="flex flex-col divide-y divide-line">
        {subjects.map((s, i) => (
          <SubjectSection
            key={s.id}
            subject={s}
            filter={filter}
            now={now}
            competitionId={competitionId}
            editable={editable}
            defaultOpen={focusSubject ? focusSubject === s.id : highlightSubject ? highlightSubject === s.id : i === 0}
            highlight={highlightSubject === s.id ? highlight : null}
            tz={tz}
          />
        ))}
      </div>
      <p className="pt-2 text-sm text-fg-subtle">
        Status, questões e revisões são atualizados automaticamente por sessões e questões respondidas. Tempo total estudado:{" "}
        {formatMinutes(subjects.reduce((a, s) => a + s.topics.reduce((b, t) => b + t.studiedMinutes, 0), 0))}.
      </p>
    </div>
  );
}
