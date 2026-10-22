import "server-only";
import { env, isProduction } from "@/lib/env";
import { generateJson, QuestionAiError } from "./gemini";
import { AiOutputError, claudeConfigured, structuredCall as claudeStructuredCall, type StructuredCallInput } from "./claude";
import { recordAiUsage, type TokenUsage } from "./usage";
import { chatGptConfigured, personalChatGpt } from "./chatgpt-auth";
import { chatGptModel, chatGptResponse } from "./chatgpt";
import { ChatGptError, omitOptionalNulls, strictJsonSchema } from "./chatgpt-protocol";

/*
 * Provider-neutral structured calls for the essay features. In personal mode,
 * the connected ChatGPT plan is used. Otherwise Claude (Anthropic) or Gemini
 * (Google) is chosen by ESSAY_PROVIDER; unset, Claude when its key
 * exists, otherwise Gemini. Either way the answer is validated with zod and
 * retried once, and every call is recorded in AiUsage.
 */

export type EssayProvider = "anthropic" | "gemini" | "chatgpt";

export function essayProvider(): EssayProvider {
  if (personalChatGpt()) return "chatgpt";
  return env.ESSAY_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "gemini");
}

/** Gemini's free tier may use content to improve Google's products: never with student essays in production. */
export function essayAiConfigured() {
  if (essayProvider() === "chatgpt") return chatGptConfigured();
  if (essayProvider() === "anthropic") return claudeConfigured();
  return !!env.GEMINI_API_KEY && env.ESSAY_GEMINI_MODELS.length > 0 && (!isProduction || env.GEMINI_PAID_TIER === "on");
}

export function essayProviderLabel() {
  if (essayProvider() === "chatgpt") return "OpenAI (seu plano ChatGPT)";
  return essayProvider() === "anthropic" ? "Anthropic (Claude)" : "Google (Gemini)";
}

/** Model used for each essay feature with the active provider (Gemini falls back along its list). */
export function essayModel(kind: "correction" | "rewrite" | "theme") {
  if (essayProvider() === "chatgpt") return chatGptModel();
  if (essayProvider() === "gemini") return env.ESSAY_GEMINI_MODELS[0]!;
  return kind === "correction" ? env.ESSAY_MODEL : kind === "rewrite" ? env.ESSAY_REWRITE_MODEL : env.ESSAY_THEME_MODEL;
}

/** JSON Schema (as sent to Claude) → the OpenAPI subset Gemini accepts. */
export function jsonSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof schema.type === "string") out.type = schema.type.toUpperCase();
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (schema.properties && typeof schema.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([k, v]) => [k, jsonSchemaToGemini(v)]));
  }
  if (Array.isArray(schema.required)) out.required = schema.required;
  if (schema.items && typeof schema.items === "object") out.items = jsonSchemaToGemini(schema.items as Record<string, unknown>);
  return out;
}

function toOutputError(err: QuestionAiError) {
  switch (err.kind) {
    case "blocked":
      return new AiOutputError("A IA recusou o pedido.", "refusal");
    case "truncated":
      return new AiOutputError("A resposta da IA foi cortada.", "truncated");
    case "invalid-output":
      return new AiOutputError("A resposta da IA não veio em JSON válido.", "invalid");
    case "daily-quota":
    case "rate-limit":
      return new AiOutputError("Limite de uso da IA atingido por agora.", "quota");
    default:
      return new AiOutputError(err.message, "unavailable");
  }
}

async function geminiStructuredCall<T>(input: StructuredCallInput<T>): Promise<{ data: T; model: string; usage: TokenUsage }> {
  // A Gemini model named explicitly (calibration) is tried alone; otherwise the configured list.
  const models = input.model.startsWith("gemini") ? [input.model] : env.ESSAY_GEMINI_MODELS;
  const schema = jsonSchemaToGemini(input.jsonSchema);
  let usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Awaited<ReturnType<typeof generateJson<unknown>>>;
    try {
      r = await generateJson<unknown>({
        models,
        system: input.system.join("\n\n"),
        parts: [{ text: input.user }],
        schema,
        thinking: input.effort === "low" ? "low" : "high",
      });
    } catch (err) {
      if (err instanceof QuestionAiError) throw toOutputError(err);
      throw err;
    }
    const u = { input: r.usage.input, output: r.usage.output, cacheRead: 0, cacheWrite: 0 };
    usage = { ...usage, input: usage.input + u.input, output: usage.output + u.output };
    await recordAiUsage({ userId: input.userId, feature: input.feature, model: r.model, usage: u, refId: input.refId });
    const parsed = input.schema.safeParse(r.data);
    if (parsed.success) return { data: parsed.data, model: r.model, usage };
    lastError = new AiOutputError(`A resposta da IA não passou na validação: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`, "invalid");
  }
  throw lastError;
}

export async function essayStructuredCall<T>(input: StructuredCallInput<T>) {
  if (essayProvider() === "chatgpt") return chatGptStructuredCall(input);
  if (essayProvider() === "gemini") return geminiStructuredCall(input);
  return claudeStructuredCall(input);
}

async function chatGptStructuredCall<T>(input: StructuredCallInput<T>): Promise<{ data: T; model: string; usage: TokenUsage }> {
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await chatGptResponse({ model: input.model, input: [{ role: "user", content: input.user }], instructions: input.system.join("\n\n"), text: { format: { type: "json_schema", name: "vertice_essay", strict: true, schema: strictJsonSchema(input.jsonSchema) } } });
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      usage.cacheRead += result.usage.cacheRead;
      await recordAiUsage({ userId: input.userId, feature: input.feature, model: result.model, usage: result.usage, refId: input.refId });
      let data: unknown;
      try { data = omitOptionalNulls(JSON.parse(result.text), input.jsonSchema); } catch { data = undefined; }
      const parsed = input.schema.safeParse(data);
      if (parsed.success) return { data: parsed.data, model: result.model, usage };
    }
    throw new AiOutputError("A resposta do ChatGPT não passou na validação da redação. Tente novamente.", "invalid");
  } catch (error) {
    if (!(error instanceof ChatGptError)) throw error;
    const reason = { auth: "unavailable", quota: "quota", unavailable: "unavailable", invalid: "invalid", refusal: "refusal", truncated: "truncated" } as const;
    throw new AiOutputError(error.message, reason[error.kind]);
  }
}
