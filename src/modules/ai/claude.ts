import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiFeature } from "@prisma/client";
import type { z } from "zod";
import { env } from "@/lib/env";
import { emptyUsage, addUsage, recordAiUsage, type TokenUsage } from "./usage";

/*
 * Structured Claude calls for features that need validated JSON (essays).
 * Every call is recorded in AiUsage; the output is never trusted until it
 * passes the zod schema, and a failed validation is retried once.
 */

let client: Anthropic | null = null;
/** Set when the account rejects the server-side fallback beta; later calls skip it. */
let fallbacksRejected = false;

export function claudeConfigured() {
  return !!env.ANTHROPIC_API_KEY;
}

export function getClaudeClient() {
  if (!env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 180_000 });
  return client;
}

export class AiOutputError extends Error {
  constructor(
    message: string,
    readonly reason: "invalid" | "refusal" | "truncated" | "unavailable",
  ) {
    super(message);
    this.name = "AiOutputError";
  }
}

export interface StructuredCallInput<T> {
  feature: AiFeature;
  userId: string | null;
  refId?: string | null;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  /** Fixed parts first (instructions, rubric): each block is cached. */
  system: string[];
  /** Variable part last: the student's text goes here. */
  user: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
}

/** Fallback form accepted by the current Sonnet/Opus models on the Claude API. */
function supportsDefaultFallback(model: string) {
  return /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/.test(model);
}

function isFallbackRejection(err: unknown) {
  return err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message);
}

export function buildStructuredParams<T>(input: StructuredCallInput<T>, withFallbacks: boolean) {
  return {
    model: input.model,
    max_tokens: input.maxTokens,
    ...(withFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    thinking: { type: "adaptive" as const },
    output_config: { effort: input.effort, format: { type: "json_schema" as const, schema: input.jsonSchema } },
    // Each fixed block is its own cache breakpoint: instructions are shared by every competition, the rubric by its students.
    system: input.system.map((text) => ({ type: "text" as const, text, cache_control: { type: "ephemeral" as const } })),
    messages: [{ role: "user" as const, content: input.user }],
  };
}

function messageUsage(m: Anthropic.Beta.BetaMessage): TokenUsage {
  return { input: m.usage.input_tokens, output: m.usage.output_tokens, cacheRead: m.usage.cache_read_input_tokens ?? 0, cacheWrite: m.usage.cache_creation_input_tokens ?? 0 };
}

export function parseStructured<T>(message: Anthropic.Beta.BetaMessage, schema: z.ZodType<T>): T {
  if (message.stop_reason === "refusal") throw new AiOutputError("A IA recusou o pedido.", "refusal");
  if (message.stop_reason === "max_tokens") throw new AiOutputError("A resposta da IA foi cortada.", "truncated");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiOutputError("A resposta da IA não veio em JSON válido.", "invalid");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AiOutputError(`A resposta da IA não passou na validação: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`, "invalid");
  return parsed.data;
}

/**
 * One structured call with a single retry on invalid output. Usage of every
 * attempt is recorded, including failed ones (they cost money too).
 */
export async function structuredCall<T>(input: StructuredCallInput<T>): Promise<{ data: T; model: string; usage: TokenUsage }> {
  const anthropic = getClaudeClient();
  if (!anthropic) throw new AiOutputError("Serviço de IA não configurado.", "unavailable");
  let usage = emptyUsage();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let message: Anthropic.Beta.BetaMessage;
    for (;;) {
      const withFallbacks = supportsDefaultFallback(input.model) && !fallbacksRejected;
      try {
        message = await anthropic.beta.messages.stream(buildStructuredParams(input, withFallbacks)).finalMessage();
        break;
      } catch (err) {
        if (withFallbacks && isFallbackRejection(err)) {
          fallbacksRejected = true;
          continue;
        }
        throw err;
      }
    }
    const u = messageUsage(message);
    usage = addUsage(usage, u);
    await recordAiUsage({ userId: input.userId, feature: input.feature, model: message.model, usage: u, refId: input.refId });
    try {
      return { data: parseStructured(message, input.schema), model: message.model, usage };
    } catch (err) {
      lastError = err;
      // A refusal will not change on retry; invalid or cut output gets one more try.
      if (err instanceof AiOutputError && err.reason === "refusal") throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new AiOutputError("Falha na resposta da IA.", "invalid");
}
