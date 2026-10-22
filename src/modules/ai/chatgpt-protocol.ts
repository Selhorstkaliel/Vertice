/** Wire types shared by the local ChatGPT client and its offline verification. */
export class ChatGptError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "quota" | "unavailable" | "invalid" | "refusal" | "truncated" = "unavailable",
    readonly status: number | null = null,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ChatGptError";
  }
}

export interface ResponseItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  namespace?: string;
  arguments?: string;
  content?: { type: string; text?: string; refusal?: string }[];
  [key: string]: unknown;
}

export interface ChatGptResponse {
  model: string;
  output: ResponseItem[];
  text: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Do not include provider response bodies in logs: they can contain user data. */
export function chatGptFailure(status: number, body: unknown, requestId?: string): ChatGptError {
  const error = body && typeof body === "object" && "error" in body ? (body as { error: unknown }).error : body;
  const code = typeof error === "string" ? error : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  if (status === 429 || /usage_limit|usage_unavailable/.test(code ?? "")) {
    return new ChatGptError("Limite do ChatGPT atingido. Consulte https://chatgpt.com/#settings/Usage e retome quando houver franquia disponível.", "quota", status, code, requestId);
  }
  if (status === 401 || status === 403 || /^(invalid_grant|invalid_refresh_token|refresh_token_|token_expired|token_invalidated)/.test(code ?? "")) {
    return new ChatGptError("A conexão ou elegibilidade do ChatGPT foi recusada. Reconecte em Admin › Conexão de IA (/admin/ia) e autorize o uso do plano.", "auth", status, code, requestId);
  }
  return new ChatGptError(`Não foi possível concluir o pedido ao ChatGPT (${status}${code ? `, ${code}` : ""}).`, "unavailable", status, code, requestId);
}

/**
 * SSE frames can cross arbitrary byte boundaries or use CRLF. Only a terminal
 * response.completed authorizes using output or executing tools.
 */
export async function readChatGptStream(response: Response, onText?: (delta: string) => void): Promise<ChatGptResponse> {
  if (!response.ok) throw chatGptFailure(response.status, await response.json().catch(() => null), response.headers.get("x-request-id") ?? undefined);
  if (!response.body) throw new ChatGptError("O ChatGPT devolveu uma resposta vazia.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let completed: { model?: string; output?: ResponseItem[]; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } | null = null;
  let refused = false;
  // The plan-sharing route may finish with an empty response.output; the items arrive in output_item.done.
  const items: ResponseItem[] = [];
  const event = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let e: Record<string, unknown>;
    try { e = JSON.parse(data) as Record<string, unknown>; }
    catch { throw new ChatGptError("O ChatGPT devolveu um evento inválido.", "invalid"); }
    if (e.type === "response.output_text.delta" && typeof e.delta === "string") onText?.(e.delta);
    if (e.type === "response.output_item.done" && e.item && typeof e.item === "object") {
      const index = typeof e.output_index === "number" ? e.output_index : items.length;
      items[index] = e.item as ResponseItem;
    }
    if (e.type === "response.refusal.delta" || e.type === "response.refusal.done") refused = true;
    if (e.type === "error" || e.type === "response.failed") {
      const failure = (e.response ?? e) as { error?: unknown };
      throw chatGptFailure(500, failure, response.headers.get("x-request-id") ?? undefined);
    }
    if (e.type === "response.incomplete") throw new ChatGptError("A resposta do ChatGPT ficou incompleta. Retome o pedido.", "truncated");
    if (e.type === "response.completed") completed = e.response as NonNullable<typeof completed>;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      // Normalize only complete CRLF pairs; a trailing CR may belong to the next chunk.
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        event(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
    }
    if (buffer.trim()) event(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!completed) throw new ChatGptError("A conexão terminou antes de o ChatGPT concluir a resposta.", "truncated");
  const result = completed as { model?: string; output?: ResponseItem[]; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } };
  const output = result.output?.length ? result.output : items.filter(Boolean);
  if (refused || output.some((item) => item.content?.some((part) => part.type === "refusal"))) throw new ChatGptError("O ChatGPT recusou este pedido.", "refusal");
  const cacheRead = result.usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    model: result.model ?? "",
    output,
    text: output.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join(""),
    usage: { input: Math.max(0, (result.usage?.input_tokens ?? 0) - cacheRead), output: result.usage?.output_tokens ?? 0, cacheRead, cacheWrite: 0 },
  };
}

/** Convert the existing Gemini subset to strict JSON Schema without changing enum values or property names. */
export function strictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out = { ...schema };
  if (typeof out.type === "string") out.type = out.type.toLowerCase();
  if (out.properties && typeof out.properties === "object") {
    const required = new Set(Array.isArray(out.required) ? out.required as string[] : []);
    const properties = Object.fromEntries(Object.entries(out.properties).map(([name, value]) => {
      const property = strictJsonSchema(value as Record<string, unknown>);
      return [name, required.has(name) ? property : { anyOf: [property, { type: "null" }] }];
    }));
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  } else if (out.type === "object") {
    out.properties = {};
    out.required = [];
    out.additionalProperties = false;
  }
  if (out.nullable === true) {
    delete out.nullable;
    return { anyOf: [strictJsonSchema(out), { type: "null" }] };
  }
  if (out.items && typeof out.items === "object") out.items = strictJsonSchema(out.items as Record<string, unknown>);
  if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map((s) => strictJsonSchema(s as Record<string, unknown>));
  return out;
}

/** Optional Gemini properties may return null under strict JSON; omit those keys for the existing validators. */
export function omitOptionalNulls(value: unknown, schema: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => omitOptionalNulls(item, (schema.items ?? {}) as Record<string, unknown>));
  if (!value || typeof value !== "object") return value;
  const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.entries(value).filter(([name, item]) => item !== null || required.has(name) || properties[name]?.nullable === true).map(([name, item]) => [name, omitOptionalNulls(item, properties[name] ?? {})]));
}
