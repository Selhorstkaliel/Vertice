"use client";

import * as React from "react";
import { toast } from "sonner";

/*
 * Buttons call the server through server actions. Two failures used to be
 * silent: the server being down (restarting, Docker closed) and a tab opened
 * before an update, whose buttons point to code that no longer exists. Here
 * the first becomes a visible message and the second reloads the tab.
 */

const STALE = /Server Action .* was not found|Failed to find Server Action|ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i;
const OFFLINE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

function reload(reason: string) {
  // Never loop: one automatic reload per minute at most.
  try {
    const last = Number(sessionStorage.getItem("vertice-reload") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("vertice-reload", String(Date.now()));
  } catch { /* private mode: reload anyway */ }
  toast.message(reason);
  setTimeout(() => window.location.reload(), 800);
}

export function UpdateGuard() {
  const build = React.useRef<string | null>(null);

  React.useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/versao", { cache: "no-store" });
        if (!res.ok) return;
        const { build: current } = (await res.json()) as { build: string };
        if (build.current === null) build.current = current;
        else if (current !== build.current) reload("O Vértice foi atualizado. Recarregando a página…");
      } catch { /* offline: the next action shows the message */ }
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const onFailure = (reason: unknown) => {
      const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "");
      if (STALE.test(message)) reload("Esta página estava desatualizada. Recarregando…");
      else if (OFFLINE.test(message)) toast.error("Não foi possível falar com o Vértice. Verifique se ele está aberto (npm run local) e tente de novo.", { id: "vertice-offline" });
    };
    const onRejection = (e: PromiseRejectionEvent) => onFailure(e.reason);
    const onError = (e: ErrorEvent) => onFailure(e.error ?? e.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
