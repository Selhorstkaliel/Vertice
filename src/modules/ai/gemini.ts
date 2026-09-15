import "server-only";
import { env } from "@/lib/env";

/*
 * Native Gemini API client for the question bank: PDF uploads (Files API) and
 * JSON answers constrained by a response schema. The Mentor uses the
 * OpenAI-compatible endpoint instead; this one is needed for PDFs and schemas.
 */

export type GeminiPart = { text: string } | { fileUri: string; mimeType: string } | { inlineData: Uint8Array; mimeType: string };

export type QuestionAiErrorKind = "not-configured" | "daily-quota" | "rate-limit" | "auth" | "bad-request" | "file-expired" | "unavailable" | "truncated" | "invalid-output" | "blocked";

export class QuestionAiError extends Error {
  constructor(
    readonly kind: QuestionAiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "QuestionAiError";
  }
}

/** Uploaded files live 48 hours at Google; re-upload a little before that. */
export const GEMINI_FILE_TTL_MS = 44 * 60 * 60 * 1000;
// Long exams with reasoning can take several minutes to answer.
const REQUEST_TIMEOUT_MS = 600_000;
const MAX_WAIT_SEC = 65;

/** Models whose free daily quota ran out, with the UTC day it happened (quotas reset daily at Pacific midnight). */
const exhausted = new Map<string, string>();
const today = () => new Date(Date.now() - 8 * 3600_000).toISOString().slice(0, 10);

export function questionAiConfigured() {
  return !!env.GEMINI_API_KEY && env.QUESTION_AI_MODELS.length > 0;
}

export function availableModels() {
  return env.QUESTION_AI_MODELS.filter((m) => exhausted.get(m) !== today());
}

function key() {
  if (!env.GEMINI_API_KEY) throw new QuestionAiError("not-configured", "Configure GEMINI_API_KEY para importar provas e gerar questões.");
  return env.GEMINI_API_KEY;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

function classify(status: number, body: string): { error: QuestionAiError; waitSec: number | null } {
  const retry = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  if (status === 429) {
    if (/"quotaId"\s*:\s*"[^"]*PerDay/i.test(body)) return { error: new QuestionAiError("daily-quota", "Limite diário gratuito da IA atingido."), waitSec: null };
    return { error: new QuestionAiError("rate-limit", "Limite por minuto da IA atingido."), waitSec: retry ? Number(retry) : 30 };
  }
  if (status === 401 || (status === 403 && /API key|API_KEY/i.test(body))) return { error: new QuestionAiError("auth", "A chave da API do Gemini foi recusada."), waitSec: null };
  if ((status === 403 || status === 404) && /file/i.test(body)) return { error: new QuestionAiError("file-expired", "O arquivo enviado à IA expirou."), waitSec: null };
  if (status === 404) return { error: new QuestionAiError("bad-request", "Modelo de IA não encontrado. Revise QUESTION_AI_MODELS."), waitSec: null };
  if (status >= 500) return { error: new QuestionAiError("unavailable", "O serviço de IA está instável."), waitSec: 10 };
  return { error: new QuestionAiError("bad-request", `Pedido recusado pela IA (${status}): ${body.slice(0, 300)}`), waitSec: null };
}

async function call(url: string, init: RequestInit, signal?: AbortSignal) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]) });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new QuestionAiError("unavailable", `Sem conexão com o serviço de IA: ${err instanceof Error ? err.message : "erro de rede"}`);
  }
}

/** Resumable upload of a PDF to the Files API; waits until Google finishes processing it. */
export async function uploadPdf(bytes: Uint8Array, displayName: string, signal?: AbortSignal) {
  const start = await call(
    `${env.GEMINI_BASE_URL}/upload/v1beta/files`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key(),
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
    },
    signal,
  );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw classify(start.status, await start.text()).error;
  const done = await call(uploadUrl, { method: "POST", headers: { "Content-Length": String(bytes.length), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: Buffer.from(bytes) }, signal);
  if (!done.ok) throw classify(done.status, await done.text()).error;
  let file = ((await done.json()) as { file: { name: string; uri: string; state?: string } }).file;
  for (let i = 0; file.state === "PROCESSING" && i < 90; i++) {
    await sleep(2000, signal);
    const r = await call(`${env.GEMINI_BASE_URL}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key() } }, signal);
    if (!r.ok) throw classify(r.status, await r.text()).error;
    file = (await r.json()) as typeof file;
  }
  if (file.state && file.state !== "ACTIVE") throw new QuestionAiError("invalid-output", `A IA não conseguiu processar o PDF (${file.state}).`);
  return { uri: file.uri, uploadedAt: new Date() };
}

export interface GenerateJsonOptions {
  parts: GeminiPart[];
  /** OpenAPI-subset schema (types in upper case), enforced by the API. */
  schema: Record<string, unknown>;
  system?: string;
  /** Omit with thinking: Gemini 3 reasons best at its default temperature. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Reasoning before answering (Gemini 3 models). Solving exam questions needs "high": without it most answers are wrong. */
  thinking?: "low" | "high";
  signal?: AbortSignal;
  /** Called before waiting for a per-minute limit, for progress messages. */
  onWait?: (seconds: number) => void;
}

export interface GenerateJsonResult<T> {
  data: T;
  model: string;
  requests: number;
  usage: { input: number; output: number };
}

/**
 * One JSON answer. Waits out per-minute limits, moves to the next configured
 * model when a model's free daily quota is exhausted, and retries once on
 * output that does not parse.
 */
export async function generateJson<T>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
  const body = JSON.stringify({
    ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
    contents: [
      {
        role: "user",
        parts: options.parts.map((p) =>
          "text" in p ? { text: p.text } : "fileUri" in p ? { file_data: { mime_type: p.mimeType, file_uri: p.fileUri } } : { inline_data: { mime_type: p.mimeType, data: Buffer.from(p.inlineData).toString("base64") } },
        ),
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: options.schema, ...(options.temperature === undefined ? {} : { temperature: options.temperature }), maxOutputTokens: options.maxOutputTokens ?? 32_000, ...(options.thinking ? { thinkingConfig: { thinkingLevel: options.thinking } } : {}) },
  });

  let requests = 0;
  let lastError: QuestionAiError | null = null;
  for (const model of availableModels()) {
    let invalidRetries = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      requests++;
      let response: Response;
      try {
        response = await call(`${env.GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key(), "Content-Type": "application/json" }, body }, options.signal);
      } catch (err) {
        // Timeouts and dropped connections are usually passing: wait and try again a couple of times.
        if (!(err instanceof QuestionAiError) || err.kind !== "unavailable" || attempt >= 2) throw err;
        lastError = err;
        options.onWait?.(20 * (attempt + 1));
        await sleep(20_000 * (attempt + 1), options.signal);
        continue;
      }
      if (!response.ok) {
        const { error, waitSec } = classify(response.status, await response.text());
        lastError = error;
        if (error.kind === "daily-quota") {
          exhausted.set(model, today());
          break;
        }
        if (waitSec !== null && waitSec <= MAX_WAIT_SEC && attempt < 4) {
          options.onWait?.(Math.ceil(waitSec));
          await sleep((waitSec + 1) * 1000, options.signal);
          continue;
        }
        throw error;
      }
      const json = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        modelVersion?: string;
      };
      const candidate = json.candidates?.[0];
      if (json.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
        throw new QuestionAiError("blocked", "A IA recusou este conteúdo.");
      }
      if (candidate?.finishReason === "MAX_TOKENS") throw new QuestionAiError("truncated", "A resposta da IA foi cortada por tamanho.");
      const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      try {
        return {
          data: JSON.parse(text) as T,
          model: json.modelVersion ?? model,
          requests,
          usage: { input: json.usageMetadata?.promptTokenCount ?? 0, output: json.usageMetadata?.candidatesTokenCount ?? 0 },
        };
      } catch {
        lastError = new QuestionAiError("invalid-output", "A IA devolveu uma resposta em formato inválido.");
        if (invalidRetries++ >= 1) throw lastError;
      }
    }
  }
  throw lastError ?? new QuestionAiError("daily-quota", "Limite diário gratuito da IA atingido em todos os modelos configurados.");
}

/** Portuguese explanation for admins, with what to do next. */
export function describeQuestionAiError(err: unknown) {
  if (!(err instanceof QuestionAiError)) return "Erro inesperado ao usar a IA. Veja o log do servidor.";
  switch (err.kind) {
    case "daily-quota":
      return "Limite diário gratuito da IA atingido. A importação continua de onde parou quando você retomar amanhã.";
    case "rate-limit":
      return "A IA está limitando pedidos por minuto. Tente retomar em alguns minutos.";
    default:
      return err.message;
  }
}
