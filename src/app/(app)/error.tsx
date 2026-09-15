"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 py-16" role="alert">
      <h1 className="text-xl font-semibold">Não foi possível carregar esta página</h1>
      <p className="max-w-md text-base text-fg-muted">
        Ocorreu um erro ao buscar seus dados. Tente novamente; se persistir, verifique sua conexão.
        {error.digest && <span className="mt-2 block text-sm text-fg-subtle">Código: {error.digest}</span>}
      </p>
      <Button variant="secondary" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
