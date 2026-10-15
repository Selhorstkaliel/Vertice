import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { MentorContext } from "./data";
import { MENTOR_SYSTEM_PROMPT } from "./prompt";
import { mentorProvider } from "./provider";
import { runCompatTurn, toSimpleText } from "./providers/openai-compatible";
import { MENTOR_TOOLS, type ToolRunState } from "./tools";
import { MentorProviderError, MentorRefusalError, runToolCalls, type MentorStreamEvent, type MentorTurnResult } from "./turn-shared";

export { MentorRefusalError, MentorProviderError, type MentorStreamEvent, type MentorTurnResult };


let client: Anthropic | null = null;
/** Set when the account rejects the server-side fallback beta; later calls skip it. */
let fallbacksRejected = false;

export function isMentorAiConfigured() {
  return mentorProvider().configured;
}

export function mentorFallbacksActive() {
  return env.MENTOR_FALLBACKS === "default" && !fallbacksRejected;
}

export function getMentorClient() {
  const provider = mentorProvider();
  if (provider.id !== "anthropic" || !provider.apiKey) return null;
  client ??= new Anthropic({ apiKey: provider.apiKey, maxRetries: 2, timeout: 120_000 });
  return client;
}

/** The Anthropic request for one model round; shared with the verification script. */
export function buildMentorRequest(messages: Anthropic.Beta.BetaMessageParam[], lastRound: boolean) {
  return {
    model: mentorProvider().model,
    max_tokens: 16_000,
    // Re-runs a request declined by safety classifiers on Anthropic's recommended fallback model.
    ...(mentorFallbacksActive() ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    thinking: { type: "adaptive" as const },
    // Chat-style answers hold quality at medium effort; set MENTOR_EFFORT to change it.
    output_config: { effort: env.MENTOR_EFFORT ?? ("medium" as const) },
    cache_control: { type: "ephemeral" as const },
    system: [{ type: "text" as const, text: MENTOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }],
    tools: MENTOR_TOOLS,
    // Out of rounds: the model must answer with what it already gathered.
    ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
    messages,
  };
}

/** A 400 caused by the fallback parameter or its beta header, not by the conversation. */
export function isFallbackRejection(err: unknown) {
  return err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message);
}

/**
 * One student message → one grounded answer, on the configured provider. Every
 * tool call is validated, scoped to the student and recorded for explainability.
 * Text is streamed to `emit` as it arrives.
 */
export async function runMentorTurn(
  ctx: MentorContext,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: (event: MentorStreamEvent) => void,
  signal: AbortSignal,
  partial: { text: string },
): Promise<MentorTurnResult> {
  const provider = mentorProvider();
  if (!provider.configured) throw new Error("Mentor AI is not configured");
  if (provider.id !== "anthropic") {
    const history = messages.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: toSimpleText(m.content) }));
    return runCompatTurn(provider, ctx, history, emit, signal, partial, env.MENTOR_EFFORT);
  }
  return runAnthropicTurn(ctx, messages, emit, signal, partial);
}

async function runAnthropicTurn(
  ctx: MentorContext,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: (event: MentorStreamEvent) => void,
  signal: AbortSignal,
  partial: { text: string },
): Promise<MentorTurnResult> {
  const anthropic = getMentorClient()!;
  const state: ToolRunState = { proposals: 0, recommendationIds: [] };
  const sources = new Set<string>();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model = mentorProvider().model;
  let truncated = false;

  // Hard ceiling on model calls per student message (tool rounds included); per plan later.
  const maxRounds = env.MENTOR_MAX_ROUNDS;
  for (let round = 0; round < maxRounds; round++) {
    const lastRound = round === maxRounds - 1;
    let roundText = "";
    let message: Anthropic.Beta.BetaMessage;
    for (;;) {
      const usingFallbacks = mentorFallbacksActive();
      const stream = anthropic.beta.messages.stream(buildMentorRequest(messages, lastRound), { signal });
      stream.on("text", (delta) => {
        if (!roundText && partial.text) {
          partial.text += "\n\n";
          emit({ type: "text", delta: "\n\n" });
        }
        roundText += delta;
        partial.text += delta;
        emit({ type: "text", delta });
      });
      try {
        message = await stream.finalMessage();
        break;
      } catch (err) {
        // Accounts without the fallback beta get a 400 before any output: retry once without it.
        if (usingFallbacks && !roundText && isFallbackRejection(err)) {
          fallbacksRejected = true;
          console.warn("[mentor] server-side fallbacks rejected by the API; continuing without them. Set MENTOR_FALLBACKS=off to skip the attempt.");
          continue;
        }
        throw err;
      }
    }
    model = message.model;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      // Partial output from a declined response must not be kept.
      partial.text = partial.text.slice(0, partial.text.length - roundText.length).trimEnd();
      emit({ type: "discard" });
      throw new MentorRefusalError();
    }

    if (message.stop_reason === "tool_use" || message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) continue;
      const results = await runToolCalls(ctx, calls, state, sources, emit);
      messages.push({
        role: "user",
        content: calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: results.get(c.id)!.content, is_error: results.get(c.id)!.isError })),
      });
      continue;
    }

    truncated = message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded";
    break;
  }

  return { text: partial.text.trim(), sources: [...sources], recommendationIds: state.recommendationIds, model, truncated, refused: false, usage };
}

/** Student-facing message for an API failure; details go to the server log only. */
export function describeMentorError(err: unknown): { message: string; log: boolean } {
  if (err instanceof MentorRefusalError) return { message: "Não posso ajudar com esse pedido. Reformule a pergunta com foco na sua preparação.", log: false };
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError")) return { message: "Resposta interrompida.", log: false };

  const status = err instanceof MentorProviderError ? err.status : err instanceof Anthropic.APIError ? (err.status ?? null) : undefined;
  const connection = err instanceof Anthropic.APIConnectionError || (err instanceof MentorProviderError && err.status === null);
  if (connection) return { message: "Não foi possível conectar ao serviço de IA. Verifique a conexão do servidor e tente novamente.", log: true };
  if (status === 401 || status === 403) return { message: "O Mentor está indisponível: a chave de acesso ao serviço de IA foi recusada. Avise o administrador da plataforma.", log: true };
  if (status === 404) return { message: "O Mentor está indisponível: o modelo de IA configurado não foi encontrado. Avise o administrador da plataforma.", log: true };
  if (err instanceof MentorProviderError && err.dailyQuota) {
    return { message: "O limite diário gratuito do serviço de IA foi atingido. O Mentor com IA volta amanhã; as análises automáticas continuam disponíveis.", log: true };
  }
  if (status === 429) {
    return {
      message: mentorProvider().id === "anthropic" ? "O serviço de IA está com muitas solicitações agora. Tente novamente em instantes." : "O limite de uso do serviço de IA foi atingido por agora. Tente novamente em alguns minutos.",
      log: true,
    };
  }
  if (status === 400) return { message: "Não foi possível processar esta conversa. Tente limpar a conversa e perguntar novamente.", log: true };
  if (status !== undefined) return { message: "O serviço de IA está instável agora. Tente novamente em alguns minutos.", log: true };
  return { message: "Não foi possível gerar a resposta. Tente novamente.", log: true };
}
