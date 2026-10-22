"use client";

import * as React from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startRealExamAction } from "@/modules/simulations/actions";

export function StartRealExamButton({ competitionId, partKey, label }: { competitionId: string; partKey: string; label: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await startRealExamAction(competitionId, partKey);
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      <Play aria-hidden /> {label}
    </Button>
  );
}
