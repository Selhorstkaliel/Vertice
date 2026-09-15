"use client";

import * as React from "react";
import { toast } from "sonner";
import { RotateCcw, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { deleteSimulationAction, redrawSimulationAction, retakeSimulationAction } from "@/modules/simulations/actions";

export function SimulationControls({ simulationId, title, hasOpenAttempt }: { simulationId: string; title: string; hasOpenAttempt: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string } | undefined>) =>
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) toast.error(r.error);
      else if (r?.message) toast.success(r.message);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={hasOpenAttempt ? "primary" : "secondary"} loading={pending} onClick={() => run(() => retakeSimulationAction(simulationId))}>
        <RotateCcw />
        {hasOpenAttempt ? "Continuar" : "Refazer"}
      </Button>
      {!hasOpenAttempt && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => redrawSimulationAction(simulationId))}>
          <Shuffle />
          Novas questões, mesma configuração
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`Excluir ${title}`}>
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent title="Excluir simulado?" description="O simulado e suas tentativas saem da lista. As respostas continuam contando no histórico de questões e no edital.">
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Manter simulado
            </Button>
            <Button variant="danger" loading={pending} onClick={() => run(async () => { const r = await deleteSimulationAction(simulationId); setOpen(false); return r; })}>
              Excluir simulado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
