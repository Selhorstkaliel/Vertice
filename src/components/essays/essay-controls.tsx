"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { addEssaysToPlanAction, deleteEssayDraftAction, rewriteParagraphAction, startEssayRewriteAction } from "@/modules/essays/actions";

export function ParagraphRewriteForm({ essayId, original, disabled, rewritesLeft }: { essayId: string; original: string; disabled: boolean; rewritesLeft: number }) {
  const router = useRouter();
  const [text, setText] = React.useState(original);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await rewriteParagraphAction({ essayId, text });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        });
      }}
    >
      <Textarea aria-label="Parágrafo reescrito" rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={pending} disabled={disabled || rewritesLeft <= 0 || text.trim() === original.trim()}>
          Corrigir só este trecho
        </Button>
        <span className="text-sm text-fg-subtle">Só o parágrafo e o critério são enviados. {rewritesLeft} reescritas restantes neste mês.</span>
      </div>
    </form>
  );
}

export function RewriteEssayButton({ essayId }: { essayId: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await startEssayRewriteAction(essayId);
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      Reescrever a redação inteira
    </Button>
  );
}

export function AddEssaysToPlanButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await addEssaysToPlanAction();
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        })
      }
    >
      Incluir no plano da semana
    </Button>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await deleteEssayDraftAction(id);
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      Excluir
    </Button>
  );
}
