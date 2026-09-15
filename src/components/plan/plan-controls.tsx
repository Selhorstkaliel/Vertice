"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { formatClock, formatDayKey } from "@/lib/format";
import type { RecommendationView } from "@/modules/plan/queries";
import { decideRecommendationAction, generatePlanAction, proposeRedistributionAction } from "@/modules/plan/actions";

export function GeneratePlanButton({ hasPlan, variant, week = "current" }: { hasPlan: boolean; variant?: "primary" | "secondary"; week?: "current" | "next" }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant={variant ?? (hasPlan ? "secondary" : "primary")}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generatePlanAction(week);
          if (!result.ok) toast.error(result.error);
          else toast.success(result.message);
        })
      }
    >
      {hasPlan ? <RefreshCw /> : <Sparkles />}
      {hasPlan ? "Recalcular plano" : week === "next" ? "Gerar plano da próxima semana" : "Gerar plano da semana"}
    </Button>
  );
}

export function RedistributePrompt({ missedCount }: { missedCount: number }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await proposeRedistributionAction();
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      Propor novos horários
      <span className="sr-only"> para {missedCount} sessões</span>
    </Button>
  );
}

const when = (s: { dateKey: string; startMinute: number }) => `${formatDayKey(s.dateKey, "short")}, ${formatClock(s.startMinute)}`;

export function RecommendationCard({ rec }: { rec: RecommendationView }) {
  const [selected, setSelected] = React.useState<string[]>(rec.moves.map((m) => m.itemId));
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const decide = (decision: "accept" | "ignore") =>
    startTransition(async () => {
      const result = await decideRecommendationAction(rec.id, decision, decision === "accept" ? selected : undefined);
      if (!result.ok) toast.error(result.error);
      else toast.success(result.message);
    });

  return (
    <section aria-labelledby={`rec-${rec.id}`} className="relative flex flex-col gap-4 rounded-[var(--radius-object)] bg-surface p-5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-l-[var(--radius-object)] before:bg-info">
      <div className="flex flex-col gap-1">
        <h2 id={`rec-${rec.id}`} className="text-md font-semibold">
          {rec.title}
        </h2>
        <p className="text-base text-fg-muted">
          <span className="font-medium text-fg">Por quê? </span>
          {rec.reason}
        </p>
      </div>

      {rec.moves.length > 0 && (
        <ul className="flex flex-col">
          {rec.moves.map((m) => (
            <li key={m.itemId} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
              {editing && (
                <Checkbox
                  checked={selected.includes(m.itemId)}
                  onCheckedChange={(v) => setSelected((list) => (v ? [...list, m.itemId] : list.filter((id) => id !== m.itemId)))}
                  aria-label={`Incluir ${m.label}`}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-base text-fg">{m.label}</span>
              <span className="numeral text-sm text-fg-subtle line-through">{when(m.from)}</span>
              <span className="numeral text-sm text-fg">{when(m.to)}</span>
            </li>
          ))}
        </ul>
      )}
      {rec.dropped.length > 0 && (
        <p className="text-sm text-fg-subtle">Sem espaço nesta semana: {rec.dropped.map((d) => d.label).join(", ")}.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {rec.moves.length > 0 && (
          <Button size="sm" variant="primary" loading={pending} disabled={selected.length === 0} onClick={() => decide("accept")}>
            {editing ? `Aceitar ${selected.length} selecionadas` : "Aceitar"}
          </Button>
        )}
        {rec.moves.length > 1 && !editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("ignore")}>
          Ignorar
        </Button>
      </div>
    </section>
  );
}

export function UndoRecommendation({ rec }: { rec: RecommendationView }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await decideRecommendationAction(rec.id, "undo");
          if (!result.ok) toast.error(result.error);
          else toast.success(result.message);
        })
      }
    >
      <Undo2 />
      Desfazer reagendamento
    </Button>
  );
}
