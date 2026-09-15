"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { clearMentorConversationAction } from "@/modules/mentor/actions";

export function ClearConversationButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 />
          Limpar conversa
        </Button>
      </DialogTrigger>
      <DialogContent title="Limpar a conversa?" description="As mensagens serão apagadas. Recomendações já criadas e decisões tomadas continuam valendo.">
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Manter conversa
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await clearMentorConversationAction();
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            Apagar mensagens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
