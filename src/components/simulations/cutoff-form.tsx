"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setEnrollmentCutoffAction } from "@/modules/competitions/actions";

/** "Nota de corte: X de Y" typed by the student, used when the catalog has none. */
export function CutoffForm({ competitionId, initial }: { competitionId: string; initial: { score: number; max: number } | null }) {
  const router = useRouter();
  const [score, setScore] = React.useState(initial ? String(initial.score) : "");
  const [max, setMax] = React.useState(initial ? String(initial.max) : "");
  const [pending, startTransition] = React.useTransition();
  const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await setEnrollmentCutoffAction(competitionId, { score: parse(score), max: parse(max) });
          if (!r.ok) toast.error(r.fieldErrors ? (Object.values(r.fieldErrors).flat()[0] ?? r.error) : r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-fg-muted">
        Nota de corte
        <Input inputMode="decimal" className="w-28" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Ex.: 52" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-fg-muted">
        de (nota máxima)
        <Input inputMode="decimal" className="w-28" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Ex.: 100" />
      </label>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        Salvar
      </Button>
    </form>
  );
}
