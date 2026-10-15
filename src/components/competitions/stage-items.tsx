"use client";

import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { STAGE_ITEM_KIND_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { addStageItemAction, removeStageItemAction, updateStageItemAction } from "@/modules/military/stage-actions";

export interface StageItemView {
  id: string;
  title: string;
  kind: keyof typeof STAGE_ITEM_KIND_LABEL;
  dueDate: string | null;
  done: boolean;
  custom: boolean;
  verified: boolean;
  dateFromCatalog: boolean;
  sourceUrl: string | null;
  sourceYear: number | null;
  notes: string | null;
}

export function StageItems({ stageId, stageName, items, today }: { stageId: string; stageName: string; items: StageItemView[]; today: string }) {
  const [pending, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<StageItemView["kind"]>("DOCUMENT");
  const [date, setDate] = React.useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else after?.();
    });

  const done = items.filter((i) => i.done).length;

  return (
    <div className="col-span-full flex flex-col gap-2 pl-0 sm:pl-9">
      {items.length > 0 && (
        <>
          <p className="text-sm text-fg-subtle">
            {done} de {items.length} itens feitos
          </p>
          <ul className="flex flex-col gap-1.5">
            {items.map((i) => {
              const late = !i.done && i.dueDate !== null && i.dueDate < today;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                  <Checkbox
                    checked={i.done}
                    disabled={pending}
                    aria-label={`${i.done ? "Reabrir" : "Concluir"} ${i.title}`}
                    onCheckedChange={(v) => run(() => updateStageItemAction(i.id, { done: v === true }))}
                  />
                  <span className={cn("min-w-0 flex-1", i.done ? "text-fg-subtle line-through" : "text-fg")}>
                    {i.title}
                    <span className="ml-2 text-sm text-fg-subtle">{STAGE_ITEM_KIND_LABEL[i.kind]}</span>
                  </span>
                  <Input
                    type="date"
                    aria-label={`Prazo de ${i.title}`}
                    className={cn("h-8 w-40 text-sm", late && "text-danger")}
                    defaultValue={i.dueDate ?? ""}
                    onBlur={(e) => {
                      if ((e.target.value || null) !== i.dueDate) run(() => updateStageItemAction(i.id, { dueDate: e.target.value || null }));
                    }}
                  />
                  {!i.custom &&
                    (!i.verified ? (
                      <Badge tone="warning">Informação não verificada</Badge>
                    ) : i.dateFromCatalog || !i.dueDate ? (
                      <Badge tone="positive">Edital {i.sourceYear}</Badge>
                    ) : (
                      <Badge tone="outline">Data ajustada por você</Badge>
                    ))}
                  {i.sourceUrl && (
                    <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
                      Fonte{i.sourceYear ? ` (${i.sourceYear})` : ""}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  {i.custom && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remover ${i.title}`} disabled={pending} onClick={() => run(() => removeStageItemAction(i.id))}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {adding ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addStageItemAction(stageId, { title, kind, dueDate: date || null }),
              () => {
                setTitle("");
                setDate("");
                setAdding(false);
              },
            );
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Atestado médico" aria-label={`Novo item de ${stageName}`} maxLength={120} className="h-8 max-w-64 text-sm" autoFocus />
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as StageItemView["kind"])} aria-label="Tipo do item" className="h-8 text-sm">
            {Object.entries(STAGE_ITEM_KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Prazo" className="h-8 w-40 text-sm" />
          <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={title.trim().length < 2}>
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setAdding(true)}>
          <Plus />
          Item ou prazo
        </Button>
      )}
    </div>
  );
}
