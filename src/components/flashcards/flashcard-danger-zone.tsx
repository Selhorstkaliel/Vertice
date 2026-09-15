"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { deleteFlashcardAction, setFlashcardSuspendedAction } from "@/modules/flashcards/actions";

export function FlashcardDangerZone({ id, suspended }: { id: string; suspended: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="flex flex-wrap gap-2 border-t pt-6">
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setFlashcardSuspendedAction(id, !suspended);
            if (!r.ok) toast.error(r.error);
            else toast.success(r.message);
          })
        }
      >
        {suspended ? <Play /> : <Pause />}
        {suspended ? "Reativar nas revisões" : "Suspender das revisões"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="danger" size="sm">
            <Trash2 />
            Excluir
          </Button>
        </DialogTrigger>
        <DialogContent title="Excluir flashcard?" description="O cartão e o histórico de revisões serão removidos.">
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Manter cartão
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteFlashcardAction(id);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message);
                    router.push("/flashcards");
                  }
                })
              }
            >
              Excluir flashcard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
