import "server-only";
import type { MentorContext } from "../data";
import { MENTOR_SYSTEM_PROMPT } from "../prompt";
import type { MentorProvider } from "../provider";
import { MENTOR_TOOLS, type ToolRunState } from "../tools";
import { MentorProviderError, MentorRefusalError, runToolCalls, type MentorStreamEvent, type MentorTurnResult } from "../turn-shared";

/*
 * Mentor turn over an OpenAI-compatible Chat Completions API (Gemini, Groq,
 * Ollama, OpenRouter…). Same tools, rules and explainability as the Anthropic
 * path; only the wire format differs.
 */

const MAX_ROUNDS = 8;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRY_WAIT_SEC = 45;

function waitFor(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

export interface SimpleMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: RawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Kept verbatim (including provider extras such as Gemini thought signatures) and sent back unchanged. */
interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  [extra: string]: unknown;
}

/**
 * Gemini accepts an OpenAPI subset for function parameters: no
 * additionalProperties, and enums only on strings. Removing these keeps the
 * same tools valid everywhere; the server still validates every input.
 */
function portableSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(portableSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  const src = schema as Record<string, unknown>;
  for (const [key, value] of Object.entries(src)) {
    if (key === "additionalProperties") continue;
    if (key === "enum" && src.type !== "string") continue;
    out[key] = portableSchema(value);
  }
  return out;
}

const TOOLS = MENTOR_TOOLS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description ?? "", parameters: portableSchema(t.input_schema) } }));

const EFFORT: Record<string, string> = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };

export function buildCompatRequest(provider: MentorProvider, messages: ChatMessage[], lastRound: boolean, effort?: string) {
  return {
    model: provider.model,
    messages,
    tools: TOOLS,
    // Out of rounds: the model must answer with what it already gathered.
    tool_choice: lastRound ? "none" : "auto",
    stream: true,
    ...(effort && provider.id === "gemini" ? { reasoning_effort: EFFORT[effort] } : {}),
  };
}

export async function compatRequest(provider: MentorProvider, body: unknown, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new MentorProviderError(null, err instanceof Error ? err.message : "network error");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Gemini puts the wait in RetryInfo ("retryDelay": "37s"); others use the Retry-After header.
    const fromBody = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text)?.[1];
    const fromHeader = response.headers.get("retry-after");
    const retryAfterSec = fromBody ? Number(fromBody) : fromHeader && /^\d+$/.test(fromHeader) ? Number(fromHeader) : null;
    const dailyQuota = response.status === 429 && /"quotaId"\s*:\s*"[^"]*PerDay/i.test(text);
    throw new MentorProviderError(response.status, text.slice(0, 500), dailyQuota ? null : retryAfterSec, dailyQuota);
  }
  return response;
}

/** Plain text of Anthropic-shaped or string content, for providers that take strings. */
export function toSimpleText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).filter(Boolean).join("\n\n");
  return "";
}

export async function runCompatTurn(
  provider: MentorProvider,
  ctx: MentorContext,
  history: SimpleMessage[],
  emit: (event: MentorStreamEvent) => void,
  signal: AbortSignal,
  partial: { text: string },
  effort?: string,
): Promise<MentorTurnResult> {
  const messages: ChatMessage[] = [{ role: "system", content: MENTOR_SYSTEM_PROMPT }, ...history];
  const state: ToolRunState = { proposals: 0, recommendationIds: [] };
  const sources = new Set<string>();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model = provider.model;
  let truncated = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = buildCompatRequest(provider, messages, round === MAX_ROUNDS - 1, effort);
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await compatRequest(provider, body, signal);
        break;
      } catch (err) {
        // Free tiers limit requests per minute; a short, explicit wait is worth it mid-answer.
        const wait = err instanceof MentorProviderError && err.status === 429 ? err.retryAfterSec : null;
        if (wait === null || wait > MAX_RETRY_WAIT_SEC || attempt >= 2) throw err;
        emit({ type: "status", label: `Aguardando o limite do provedor de IA (${Math.ceil(wait)} s)` });
        await waitFor((wait + 1) * 1000, signal);
      }
    }
    let roundText = "";
    let finish: string | null = null;
    const calls: RawToolCall[] = [];

    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const chunk = JSON.parse(data) as {
          model?: string;
          choices?: { delta?: { content?: string | null; tool_calls?: (Partial<RawToolCall> & { index?: number; function?: { name?: string; arguments?: string } })[] }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        if (chunk.model) model = chunk.model;
        if (chunk.usage) {
          usage.input += chunk.usage.prompt_tokens ?? 0;
          usage.output += chunk.usage.completion_tokens ?? 0;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) {
          if (!roundText && partial.text) {
            partial.text += "\n\n";
            emit({ type: "text", delta: "\n\n" });
          }
          roundText += delta.content;
          partial.text += delta.content;
          emit({ type: "text", delta: delta.content });
        }
        for (const tc of delta?.tool_calls ?? []) {
          // OpenAI streams fragments keyed by index; Gemini sends each whole call in its own chunk with no index.
          const index = tc.index ?? (tc.id ? calls.findIndex((c) => c.id === tc.id) : calls.length - 1);
          const slot = index >= 0 ? index : calls.length;
          const { index: _index, function: fn, ...rest } = tc;
          const current = (calls[slot] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
          Object.assign(current, rest);
          if (fn?.name) current.function.name += fn.name;
          if (fn?.arguments) current.function.arguments += fn.arguments;
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }

    if (finish === "content_filter") {
      // Partial output from a declined response must not be kept.
      partial.text = partial.text.slice(0, partial.text.length - roundText.length).trimEnd();
      emit({ type: "discard" });
      throw new MentorRefusalError();
    }

    const toolCalls = calls.filter((c) => c?.function.name);
    if (toolCalls.length > 0) {
      toolCalls.forEach((c, i) => (c.id ||= `call_${round}_${i}`));
      messages.push({ role: "assistant", content: roundText || null, tool_calls: toolCalls });
      const parsed = toolCalls.map((c) => {
        let input: unknown = {};
        try {
          input = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          input = { __invalid_json: c.function.arguments };
        }
        return { id: c.id, name: c.function.name, input };
      });
      const results = await runToolCalls(ctx, parsed, state, sources, emit);
      for (const c of toolCalls) {
        const out = results.get(c.id)!;
        messages.push({ role: "tool", tool_call_id: c.id, content: out.isError ? `ERRO: ${out.content}` : out.content });
      }
      continue;
    }

    truncated = finish === "length";
    break;
  }

  return { text: partial.text.trim(), sources: [...sources], recommendationIds: state.recommendationIds, model, truncated, refused: false, usage };
}
