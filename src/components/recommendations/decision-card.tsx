"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { decideRecommendationAnyAction } from "@/modules/recommendations/actions";
import type { RecommendationCardView } from "@/modules/recommendations/service";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<string, string> = {
  ACCEPTED: "Aceita",
  EDITED: "Aceita em parte",
  AUTO_APPLIED: "Aplicada automaticamente",
  IGNORED: "Ignorada",
  UNDONE: "Desfeita",
};

const OP_TEXT = { add: "Adicionar", remove: "Remover", move: "Mover", set: "Alterar" } as const;

const DESTINATION: Record<string, string> = { REPLAN: "Ver plano", ROUTINE_ADJUSTMENT: "Ver rotina", GOAL_ADJUSTMENT: "Ver rotina" };

/** Aceitar / Editar / Ignorar / Desfazer for any recommendation kind (§38). */
export function DecisionCard({ rec, compact = false }: { rec: RecommendationCardView; compact?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(rec.items.map((i) => i.key));
  const [pending, startTransition] = React.useTransition();
  const titleId = React.useId();

  const decide = (decision: "accept" | "ignore" | "undo") =>
    startTransition(async () => {
      const result = await decideRecommendationAnyAction(rec.id, decision, decision === "accept" && editing ? selected : undefined);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(result.message);
        setEditing(false);
        router.refresh();
      }
    });

  const isPending = rec.status === "PENDING";
  const tone = isPending ? "before:bg-info" : rec.undoable ? "before:bg-positive" : "before:bg-fg-faint";

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative flex flex-col gap-3 rounded-[var(--radius-object)] bg-surface py-4 pr-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-l-[var(--radius-object)]",
        tone,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className="text-base font-semibold text-fg">
          {rec.title}
        </h3>
        <span className="text-sm text-fg-subtle">{isPending ? (rec.source === "MENTOR" ? "Sugestão do Mentor" : "Sugestão do planejador") : STATUS_TEXT[rec.status]}</span>
      </div>

      {(isPending || !compact) && (
        <p className="text-base text-fg-muted">
          <span className="font-medium text-fg">Por quê? </span>
          {rec.reason}
        </p>
      )}

      {rec.items.length > 0 && (isPending || !compact) && (
        <ul className="flex flex-col">
          {rec.items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 border-b border-line-soft py-2 last:border-b-0">
              {editing && (
                <Checkbox
                  className="mt-1"
                  checked={selected.includes(item.key)}
                  onCheckedChange={(v) => setSelected((list) => (v ? [...list, item.key] : list.filter((k) => k !== item.key)))}
                  aria-label={`Incluir: ${OP_TEXT[item.op]} ${item.label}`}
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-base text-fg">
                  <span className={cn("mr-1.5 text-sm", item.op === "remove" ? "text-danger" : item.op === "add" ? "text-positive" : "text-fg-subtle")}>{OP_TEXT[item.op]}</span>
                  {item.label}
                </span>
                <span className="numeral flex flex-wrap items-center gap-x-1.5 text-sm">
                  {item.before && <span className={cn("text-fg-subtle", item.after && "line-through")}>{item.before}</span>}
                  {item.before && item.after && <ArrowRight aria-label="para" className="size-3.5 text-fg-faint" />}
                  {item.after && <span className="text-fg">{item.after}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rec.dropped.length > 0 && isPending && <p className="text-sm text-fg-subtle">Sem espaço nesta semana: {rec.dropped.join(", ")}.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {isPending && (
          <>
            {rec.items.length > 0 && (
              <Button size="sm" variant="primary" loading={pending} disabled={selected.length === 0} onClick={() => decide("accept")}>
                {editing ? `Aceitar ${selected.length} de ${rec.items.length}` : "Aceitar"}
              </Button>
            )}
            {rec.items.length > 1 &&
              (editing ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => (setEditing(false), setSelected(rec.items.map((i) => i.key)))}>
                  Cancelar edição
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
                  Editar
                </Button>
              ))}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("ignore")}>
              Ignorar
            </Button>
          </>
        )}
        {rec.undoable && (
          <Button size="sm" variant="ghost" loading={pending} onClick={() => decide("undo")}>
            <Undo2 />
            Desfazer
          </Button>
        )}
        <Button asChild size="sm" variant="link" className="ml-auto">
          <Link href={rec.href}>{DESTINATION[rec.kind] ?? "Abrir"}</Link>
        </Button>
      </div>
    </section>
  );
}
