"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { saveTafSexAction } from "@/modules/military/actions";

export function TafSexChooser() {
  const router = useRouter();
  const [pending, setPending] = React.useState<"MALE" | "FEMALE" | null>(null);
  const choose = async (sex: "MALE" | "FEMALE") => {
    setPending(sex);
    const r = await saveTafSexAction(sex);
    setPending(null);
    if (!r.ok) toast.error(r.error);
    else {
      if (r.message) toast.success(r.message);
      router.refresh();
    }
  };
  return (
    <Notice
      tone="info"
      title="Os índices do TAF mudam conforme o sexo"
      action={
        <>
          <Button size="sm" variant="primary" loading={pending === "MALE"} disabled={!!pending} onClick={() => choose("MALE")}>
            Masculino
          </Button>
          <Button size="sm" variant="primary" loading={pending === "FEMALE"} disabled={!!pending} onClick={() => choose("FEMALE")}>
            Feminino
          </Button>
        </>
      }
    >
      Informe o seu para o Vértice preencher as provas com as metas do edital. Fica salvo no seu perfil e só é usado para o TAF.
    </Notice>
  );
}
