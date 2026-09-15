"use client";

import * as React from "react";
import Link from "next/link";
import { formatTimer } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RunningSessionInfo {
  id: string;
  label: string;
  status: "RUNNING" | "PAUSED";
  /** Effective seconds accumulated up to `referenceAt`. */
  baseSeconds: number;
  /** ISO timestamp from which to keep counting (null when paused). */
  referenceAt: string | null;
}

export function useSessionClock(session: Pick<RunningSessionInfo, "status" | "baseSeconds" | "referenceAt">) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (session.status !== "RUNNING") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.status]);
  if (session.status !== "RUNNING" || !session.referenceAt) return session.baseSeconds;
  return session.baseSeconds + Math.max(0, Math.floor((now - new Date(session.referenceAt).getTime()) / 1000));
}

export function RunningSessionPill({ session, className }: { session: RunningSessionInfo; className?: string }) {
  const seconds = useSessionClock(session);
  const running = session.status === "RUNNING";
  return (
    <Link
      href="/sessao"
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] bg-surface px-3 py-2 transition-colors hover:bg-elevated",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", running ? "animate-pulse bg-performance" : "bg-warning")}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
        <span className="sr-only">{running ? "Sessão em andamento:" : "Sessão pausada:"} </span>
        {session.label}
      </span>
      <span className="font-mono text-sm tabular-nums text-fg">{formatTimer(seconds)}</span>
    </Link>
  );
}
