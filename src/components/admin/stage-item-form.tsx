"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { STAGE_ITEM_KIND_LABEL } from "@/lib/labels";
import { addCatalogStageItemAction, removeCatalogStageItemAction } from "@/modules/military/stage-actions";

export function CatalogStageItemForm({ stageId, stageName }: { stageId: string; stageName: string }) {
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [kind, setKind] = React.useState<keyof typeof STAGE_ITEM_KIND_LABEL>("DOCUMENT");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [sourceYear, setSourceYear] = React.useState("");
  const [verified, setVerified] = React.useState(false);
  const p = `item-${stageId}`;

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addCatalogStageItemAction({
            stageId,
            kind,
            title,
            description,
            dueDate: dueDate || null,
            sourceUrl,
            sourceYear: sourceYear ? Number(sourceYear) : null,
            verified,
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          setErrors({});
          setTitle("");
          setDescription("");
          setDueDate("");
          toast.success(r.message);
        });
      }}
    >
      <Field label={`Novo item em ${stageName}`} htmlFor={`${p}-title`} error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field label="Tipo" htmlFor={`${p}-kind`}>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {Object.entries(STAGE_ITEM_KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Descrição" htmlFor={`${p}-desc`} optional>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      <Field label="Prazo" htmlFor={`${p}-date`} optional error={errors.dueDate}>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Link do edital" htmlFor={`${p}-url`} error={errors.sourceUrl}>
        <Input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Ano do edital" htmlFor={`${p}-year`} optional error={errors.sourceYear}>
        <Input inputMode="numeric" value={sourceYear} onChange={(e) => setSourceYear(e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-base text-fg sm:col-span-2">
        <Switch checked={verified} onCheckedChange={setVerified} />
        Conferi no edital do ano informado
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Cadastrar item
        </Button>
      </div>
    </form>
  );
}

export function RemoveCatalogItemButton({ itemId, title }: { itemId: string; title: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Remover ${title}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await removeCatalogStageItemAction(itemId);
          if (!r.ok) toast.error(r.error);
          else toast.success(r.message);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
