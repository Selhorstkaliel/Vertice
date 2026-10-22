import "server-only";
import { env } from "@/lib/env";
import { loadFile, saveFile, sha256 } from "@/lib/storage";
import { chatGptConfigured, personalChatGpt } from "./chatgpt-auth";
import { chatGptModel, chatGptResponse } from "./chatgpt";
import { ChatGptError, omitOptionalNulls, strictJsonSchema } from "./chatgpt-protocol";
import { generateJson as geminiJson, uploadPdf as geminiUpload, questionAiConfigured as geminiConfigured, availableModels as geminiModels, QuestionAiError, type GenerateJsonOptions, type GenerateJsonResult } from "./gemini";

export { QuestionAiError, describeQuestionAiError, GEMINI_FILE_TTL_MS } from "./gemini";
export type { GenerateJsonOptions, GenerateJsonResult } from "./gemini";

const LOCAL_PDF = "vertice-local-pdf:";
let personalQuotaExhausted = false;
export const questionAiConfigured = () => personalChatGpt() ? chatGptConfigured() : geminiConfigured();
export const documentAiModel = (models: string[]) => personalChatGpt() ? chatGptModel() : models[0] ?? "";
export const availableModels = () => personalChatGpt() ? personalQuotaExhausted ? [] : [chatGptModel() || "ChatGPT"] : geminiModels();
export const reusableAiFile = (uri: string) => personalChatGpt() ? uri.startsWith(LOCAL_PDF) : !uri.startsWith(LOCAL_PDF);
export const documentAiSetupHint = () => personalChatGpt()
  ? "Conecte seu ChatGPT em Admin › Conexão de IA (/admin/ia)."
  : "Configure GEMINI_API_KEY no servidor para usar a IA de documentos.";

/** Keep a private local reference. The plan-sharing route does not support the Files upload API. */
export async function uploadPdf(bytes: Uint8Array, displayName: string, signal?: AbortSignal) {
  if (!personalChatGpt()) return geminiUpload(bytes, displayName, signal);
  signal?.throwIfAborted();
  const name = `chatgpt-${sha256(bytes)}.pdf`;
  await saveFile("provas", name, bytes);
  return { uri: `${LOCAL_PDF}${name}`, uploadedAt: new Date() };
}

export function asQuestionAiError(error: unknown): never {
  if (!(error instanceof ChatGptError)) throw error;
  if (error.kind === "quota") personalQuotaExhausted = true;
  const kind = { auth: "auth", quota: "rate-limit", unavailable: "unavailable", invalid: "invalid-output", refusal: "blocked", truncated: "truncated" } as const;
  throw new QuestionAiError(kind[error.kind], error.message);
}

/** All document features select the same personal provider, including edital classification. */
export async function generateJson<T>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
  if (!personalChatGpt()) return geminiJson<T>(options);
  try {
    const content: Record<string, unknown>[] = [];
    for (const part of options.parts) {
      if ("text" in part) content.push({ type: "input_text", text: part.text });
      else if ("fileUri" in part) {
        if (!part.fileUri.startsWith(LOCAL_PDF)) throw new QuestionAiError("file-expired", "O arquivo precisa ser preparado novamente para o ChatGPT.");
        const name = part.fileUri.slice(LOCAL_PDF.length);
        const bytes = await loadFile("provas", name);
        content.push({ type: "input_file", filename: name, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` });
      } else if (part.mimeType.startsWith("image/")) {
        content.push({ type: "input_image", image_url: `data:${part.mimeType};base64,${Buffer.from(part.inlineData).toString("base64")}`, detail: "high" });
      } else {
        content.push({ type: "input_file", filename: "documento.pdf", file_data: `data:${part.mimeType};base64,${Buffer.from(part.inlineData).toString("base64")}` });
      }
    }
    let lastError: unknown;
    const usage = { input: 0, output: 0 };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await chatGptResponse({
        input: [{ role: "user", content }],
        instructions: `${options.system ?? "Leia o material fornecido e responda ao pedido."}\nResponda apenas com o JSON do formato solicitado.`,
        text: { format: { type: "json_schema", name: "vertice_document", strict: true, schema: strictJsonSchema(options.schema) } },
        signal: options.signal,
      });
      personalQuotaExhausted = false;
      usage.input += result.usage.input + result.usage.cacheRead;
      usage.output += result.usage.output;
      try {
        return { data: omitOptionalNulls(JSON.parse(result.text), options.schema) as T, model: result.model, requests: attempt + 1, usage };
      } catch { lastError = new ChatGptError("O ChatGPT não devolveu JSON válido.", "invalid"); }
    }
    throw lastError;
  } catch (error) { return asQuestionAiError(error); }
}

export const editalAiReady = () => personalChatGpt() ? chatGptConfigured() : !!env.GEMINI_API_KEY && env.EDITAL_AI_MODELS.length > 0;
