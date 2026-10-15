"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adoptOfficialExamDateAction } from "@/modules/editais/actions";

/** Shown when an official exam date was published and the student still uses their own. */
export function UseOfficialDateButton({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="primary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await adoptOfficialExamDateAction(competitionId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        })
      }
    >
      Usar a data oficial
    </Button>
  );
}
