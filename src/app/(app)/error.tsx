"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const OFFLINE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;
const STALE = /Server Action .* was not found|Failed to find Server Action|ChunkLoadError|Loading chunk .* failed/i;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = OFFLINE.test(error.message);
  const stale = STALE.test(`${error.name}: ${error.message}`);

  useEffect(() => {
    console.error(error);
    // A tab from before an update: its buttons point to code that no longer exists.
    if (stale) window.location.reload();
  }, [error, stale]);

  if (offline) {
    return (
      <div className="flex flex-col items-start gap-4 py-16" role="alert">
        <h1 className="text-xl font-semibold">O Vértice não respondeu</h1>
        <p className="max-w-md text-base text-fg-muted">
          O servidor do Vértice está fechado ou reiniciando. Confira se ele está aberto (<code>npm run local</code>) e se o Docker Desktop está rodando, depois tente de novo.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

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
