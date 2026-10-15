"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startDiagnosticAction } from "@/modules/simulations/actions";

export function StartDiagnosticButton({ label }: { label: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="primary"
      size="lg"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await startDiagnosticAction();
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      {label}
    </Button>
  );
}
