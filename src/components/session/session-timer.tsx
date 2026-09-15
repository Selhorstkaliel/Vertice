"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Progress } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useSessionClock } from "@/components/app/running-session-pill";
import { emptyOutcome, parseOutcome, SessionOutcomeFields, type Outcome } from "@/components/plan/session-outcome-fields";
import { formatMinutes, formatTimer } from "@/lib/format";
import { discardSessionAction, finishSessionAction, pauseSessionAction, resumeSessionAction } from "@/modules/sessions/actions";

export interface ActiveSession {
  id: string;
  status: "RUNNING" | "PAUSED";
  title: string;
  subtitle: string | null;
  kind: string;
  hasTopic: boolean;
  plannedMinutes: number | null;
  baseSeconds: number;
  referenceAt: string | null;
}

export function SessionTimer({ session }: { session: ActiveSession }) {
  const seconds = useSessionClock(session);
  const [pending, startTransition] = React.useTransition();
  const [finishing, setFinishing] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome>(emptyOutcome);
  const [override, setOverride] = React.useState("");
  const [error, setError] = React.useState<{ message: string; fields?: Record<string, string[] | undefined> } | null>(null);
  const running = session.status === "RUNNING";
  const plannedSeconds = (session.plannedMinutes ?? 0) * 60;
  const overLong = seconds > Math.max(plannedSeconds * 2, 3 * 3600);

  React.useEffect(() => {
    const base = "Vértice";
    document.title = `${formatTimer(seconds)} — ${session.title} · ${base}`;
    return () => {
      document.title = base;
    };
  }, [seconds, session.title]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <p className="text-base text-fg-subtle">{running ? "Sessão em andamento" : "Sessão pausada"}</p>
        <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{session.title}</h1>
        {session.subtitle && <p className="text-base text-fg-muted">{session.subtitle}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <p className="font-mono text-[clamp(3.5rem,14vw,7.5rem)] leading-none font-light tracking-[-0.04em] text-fg tabular-nums" aria-live="off">
          {formatTimer(seconds)}
        </p>
        <span className="sr-only" aria-live="polite">
          {running ? "Cronômetro em andamento" : "Cronômetro pausado"}
        </span>
        {session.plannedMinutes ? (
          <div className="flex max-w-md flex-col gap-2">
            <Progress value={seconds} max={plannedSeconds} tone={seconds >= plannedSeconds ? "positive" : "neutral"} size="xs" label="Tempo em relação ao previsto" />
            <p className="text-sm text-fg-subtle">
              Previsto: {formatMinutes(session.plannedMinutes)}
              {seconds >= plannedSeconds && " — tempo previsto atingido."}
            </p>
          </div>
        ) : null}
      </div>

      {overLong && (
        <Notice tone="warning">O cronômetro está ativo há muito tempo. Se esqueceu de pausar, corrija o tempo efetivo ao concluir.</Notice>
      )}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button size="lg" variant="secondary" loading={pending} onClick={() => act(() => pauseSessionAction(session.id))}>
            <Pause />
            Pausar
          </Button>
        ) : (
          <Button size="lg" variant="secondary" loading={pending} onClick={() => act(() => resumeSessionAction(session.id))}>
            <Play />
            Retomar
          </Button>
        )}
        <Button size="lg" variant="primary" onClick={() => setFinishing(true)}>
          <Square />
          Concluir
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setConfirmDiscard(true)}>
          <Trash2 />
          Descartar
        </Button>
      </div>

      <Dialog open={finishing} onOpenChange={setFinishing}>
        <DialogContent title="Concluir sessão" description={`Tempo efetivo: ${formatMinutes(Math.round(seconds / 60))}.`}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await finishSessionAction({
                  id: session.id,
                  ...parseOutcome(outcome),
                  effectiveMinutesOverride: override.trim() ? Number(override) : null,
                });
                if (!r.ok) setError({ message: r.error, fields: r.fieldErrors });
                else {
                  toast.success(`Sessão registrada: ${formatMinutes(r.data.minutes)}.`);
                  setFinishing(false);
                }
              });
            }}
          >
            {error && !error.fields && <Notice tone="danger">{error.message}</Notice>}
            <SessionOutcomeFields
              value={outcome}
              onChange={setOutcome}
              showContentCompleted={session.kind === "NEW_CONTENT" && session.hasTopic}
              showQuestions={session.kind !== "FLASHCARDS"}
              errors={error?.fields}
            />
            <Field label="Corrigir tempo efetivo (minutos)" htmlFor="override" optional hint="Use se o cronômetro ficou ligado sem você estudar.">
              <Input type="number" inputMode="numeric" min={1} max={600} value={override} onChange={(e) => setOverride(e.target.value)} className="max-w-40" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setFinishing(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Registrar sessão
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent title="Descartar sessão?" description="O tempo desta sessão não será contabilizado. A sessão do plano volta a ficar pendente.">
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Manter sessão
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await discardSessionAction(session.id);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message);
                    setConfirmDiscard(false);
                  }
                })
              }
            >
              Descartar sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
