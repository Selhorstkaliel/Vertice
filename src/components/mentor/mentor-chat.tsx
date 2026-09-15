"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { DecisionCard } from "@/components/recommendations/decision-card";
import { MessageBody } from "@/components/mentor/message-body";
import { runMentorAnalysisAction } from "@/modules/mentor/actions";
import type { MentorMessageView } from "@/modules/mentor/queries";
import { MENTOR_AI_PROMPTS, MENTOR_ANALYSES, MENTOR_MESSAGE_MAX } from "@/modules/mentor/suggestions";
import type { MentorWireEvent } from "@/modules/mentor/wire";
import { cn } from "@/lib/utils";

interface MentorChatProps {
  initialMessages: MentorMessageView[];
  aiEnabled: boolean;
  dailyLimit: number;
  usedToday: number;
}

function SourcesLine({ message }: { message: MentorMessageView }) {
  const label = message.mode === "rules" ? "Análise automática, sem IA" : "Vértice Mentor";
  return (
    <p className="text-sm text-fg-subtle">
      {label}
      {message.sources.length > 0 && <span>. Dados consultados: {message.sources.join(", ")}</span>}
      {message.truncated && <span className="text-warning">. Resposta cortada por limite de tamanho</span>}
      {message.interrupted && <span className="text-warning">. Resposta interrompida</span>}
    </p>
  );
}

function AssistantMessage({ message }: { message: MentorMessageView }) {
  return (
    <article className="flex flex-col gap-2" aria-label="Resposta do Mentor">
      <MessageBody text={message.content} />
      <SourcesLine message={message} />
      {message.recommendations.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {message.recommendations.map((rec) => (
            <DecisionCard key={rec.id} rec={rec} />
          ))}
        </div>
      )}
    </article>
  );
}

function UserMessage({ message }: { message: MentorMessageView }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[var(--radius-object)] bg-elevated px-4 py-2.5 text-base whitespace-pre-line text-fg">{message.content}</p>
    </div>
  );
}

export function MentorChat({ initialMessages, aiEnabled, dailyLimit, usedToday }: MentorChatProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(initialMessages);
  const [draft, setDraft] = React.useState<{ text: string; status: string | null } | null>(null);
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [analysisKey, setAnalysisKey] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const abortRef = React.useRef<AbortController | null>(null);
  const streamingRef = React.useRef(false);
  const stickRef = React.useRef(true);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Server data wins whenever no answer is being streamed.
  React.useEffect(() => {
    if (!streamingRef.current) setMessages(initialMessages);
  }, [initialMessages]);

  React.useEffect(() => {
    const onScroll = () => {
      stickRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, draft]);

  const busy = draft !== null || analysisKey !== null;
  const remaining = Math.max(0, dailyLimit - usedToday);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    if (content.length > MENTOR_MESSAGE_MAX) {
      setError(`Máximo de ${MENTOR_MESSAGE_MAX} caracteres.`);
      return;
    }
    setError(null);
    setInput("");
    stickRef.current = true;
    const tempId = `pendente-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tempId, role: "user", content, createdAt: new Date().toISOString(), mode: "ai", sources: [], truncated: false, interrupted: false, recommendations: [] },
    ]);
    setDraft({ text: "", status: "Lendo seus dados" });
    streamingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Não foi possível falar com o Mentor agora.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line) as MentorWireEvent;
          if (event.type === "status") setDraft((d) => ({ text: d?.text ?? "", status: event.label }));
          else if (event.type === "text") setDraft((d) => ({ text: (d?.text ?? "") + event.delta, status: null }));
          else if (event.type === "discard") setDraft({ text: "", status: null });
          else if (event.type === "done") setMessages((m) => [...m, event.message]);
          else if (event.type === "error") throw new Error(event.error);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setInput(content);
        setError(err instanceof Error ? err.message : "Não foi possível falar com o Mentor agora.");
      }
    } finally {
      streamingRef.current = false;
      abortRef.current = null;
      setDraft(null);
      router.refresh();
    }
  }

  function runAnalysis(key: string) {
    if (busy) return;
    setError(null);
    stickRef.current = true;
    setAnalysisKey(key);
    startTransition(async () => {
      const result = await runMentorAnalysisAction(key);
      setAnalysisKey(null);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  const empty = messages.length === 0 && !draft && !analysisKey;

  const chip = "rounded-full px-3 py-1.5 text-left text-sm transition-colors hover:text-fg disabled:opacity-50";
  const suggestions = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões">
      {MENTOR_ANALYSES.map((a) => (
        <button
          key={a.key}
          type="button"
          disabled={busy}
          onClick={() => (aiEnabled ? send(a.question) : runAnalysis(a.key))}
          className={cn(chip, "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)]")}
        >
          {a.question}
        </button>
      ))}
      {aiEnabled &&
        MENTOR_AI_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => {
              setInput(p);
              inputRef.current?.focus();
            }}
            className={cn(chip, "text-fg-subtle shadow-[inset_0_0_0_1px_var(--line-soft)]")}
          >
            {p}
          </button>
        ))}
    </div>
  );

  return (
    <div className="flex min-h-[50dvh] min-w-0 flex-col">
      {empty ? (
        <div className="flex flex-col gap-2 py-6">
          <h2 className="text-md font-medium text-fg">Comece por uma pergunta</h2>
          <p className="max-w-xl text-base text-fg-muted">
            {aiEnabled
              ? "O Mentor consulta seu plano, rotina, desempenho, edital, erros, flashcards e simulados antes de responder, e cita os números usados."
              : "As análises abaixo são calculadas a partir dos seus dados, sem IA. A conversa livre fica disponível quando o Mentor com IA estiver configurado."}
          </p>
          {aiEnabled && <div className="mt-4">{suggestions}</div>}
        </div>
      ) : (
        <ol className="flex flex-col gap-8 pb-6" aria-label="Conversa com o Mentor">
          {messages.map((m) => (
            <li key={m.id}>{m.role === "user" ? <UserMessage message={m} /> : <AssistantMessage message={m} />}</li>
          ))}
          {draft && (
            <li aria-live="polite" aria-busy="true">
              <article className="flex flex-col gap-2" aria-label="Resposta do Mentor em andamento">
                {draft.text ? <MessageBody text={draft.text} /> : null}
                {(draft.status || !draft.text) && (
                  <p className="flex items-center gap-2 text-sm text-fg-subtle">
                    <span className="size-1.5 animate-pulse rounded-full bg-info" aria-hidden="true" />
                    {draft.status ?? "Escrevendo"}
                  </p>
                )}
              </article>
            </li>
          )}
          {analysisKey && (
            <li aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-fg-subtle">
                <span className="size-1.5 animate-pulse rounded-full bg-info" aria-hidden="true" />
                Calculando análise
              </p>
            </li>
          )}
        </ol>
      )}
      <div ref={endRef} />

      {/* The composer stays reachable while reading; the analysis list (no AI) simply follows the thread. */}
      <div
        className={cn(
          "-mx-4 mt-auto flex flex-col gap-3 border-t bg-canvas px-4 pt-3 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:pb-5",
          aiEnabled && "sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 lg:bottom-0",
        )}
      >
        {!aiEnabled && suggestions}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {aiEnabled ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <label htmlFor="mentor-input" className="sr-only">
              Mensagem para o Mentor
            </label>
            <Textarea
              ref={inputRef}
              id="mentor-input"
              value={input}
              rows={1}
              maxLength={MENTOR_MESSAGE_MAX}
              disabled={draft !== null || remaining === 0}
              placeholder={remaining === 0 ? "Limite diário atingido" : "Pergunte ao Mentor"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              className="max-h-40 min-h-11 flex-1 resize-none"
            />
            {draft ? (
              <Button type="button" size="icon" variant="secondary" aria-label="Interromper resposta" onClick={() => abortRef.current?.abort()}>
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon" variant="primary" aria-label="Enviar mensagem" disabled={!input.trim() || busy || remaining === 0}>
                <ArrowUp />
              </Button>
            )}
          </form>
        ) : null}
        {aiEnabled && (
          <p className={cn("text-sm text-fg-subtle", remaining <= 5 && "text-warning")}>
            Enter envia, Shift+Enter quebra linha. {remaining} de {dailyLimit} mensagens restantes hoje.
          </p>
        )}
      </div>
    </div>
  );
}
