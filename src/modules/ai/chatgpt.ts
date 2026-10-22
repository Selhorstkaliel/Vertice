import "server-only";
import { env } from "@/lib/env";
import { activeRegistration } from "./chatgpt-store";
import { chatGptAccess, chatGptStore, CHATGPT_RESOURCE } from "./chatgpt-auth";
import { ChatGptError, chatGptFailure, readChatGptStream, type ChatGptResponse } from "./chatgpt-protocol";

export { ChatGptError } from "./chatgpt-protocol";

export function chatGptModel() {
  if (env.CHATGPT_MODEL) return env.CHATGPT_MODEL;
  try { return activeRegistration(chatGptStore.readSync())?.model ?? ""; }
  catch { return ""; }
}

export async function chatGptModels() {
  const registration = await chatGptAccess();
  const response = await fetch(`${CHATGPT_RESOURCE}/models`, { headers: { Authorization: `Bearer ${registration.accessToken}` }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw chatGptFailure(response.status, await response.json().catch(() => null), response.headers.get("x-request-id") ?? undefined);
  const catalog = await response.json() as { models?: { slug: string; display_name: string; visibility: string }[] };
  return (catalog.models ?? []).filter((model) => model.visibility === "list" && typeof model.slug === "string" && model.slug.length > 0);
}

/** Discover account-specific model access; never guess a model from an unrelated provider. */
export async function selectChatGptModel() {
  const models = await chatGptModels();
  const selected = env.CHATGPT_MODEL ? models.find((model) => model.slug === env.CHATGPT_MODEL) : models[0];
  if (!selected) throw new ChatGptError(env.CHATGPT_MODEL ? "CHATGPT_MODEL não está disponível nesta conta. Consulte npm run chatgpt -- modelos." : "Esta conta não disponibilizou modelos para uso do plano nesta aplicação.", "auth");
  await chatGptStore.locked(async () => {
    const state = await chatGptStore.read();
    const registration = activeRegistration(state);
    if (!state || !registration) throw new ChatGptError("A conexão do ChatGPT foi encerrada.", "auth");
    registration.model = selected.slug;
    await chatGptStore.save(state);
  });
  return selected;
}

export interface ChatGptRequest {
  input: Record<string, unknown>[];
  instructions: string;
  model?: string;
  tools?: Record<string, unknown>[];
  tool_choice?: "auto" | "none";
  text?: Record<string, unknown>;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

/** Official plan-sharing route, with no API key or paid-provider fallback. */
export async function chatGptResponse(input: ChatGptRequest): Promise<ChatGptResponse> {
  const registration = await chatGptAccess();
  const model = input.model || chatGptModel() || (await selectChatGptModel()).slug;
  let response: Response;
  try {
    response = await fetch(`${CHATGPT_RESOURCE}/responses`, {
      method: "POST", headers: { Authorization: `Bearer ${registration.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: input.input, instructions: input.instructions, store: false, stream: true, include: ["reasoning.encrypted_content"],
        ...(input.tools ? { tools: input.tools, tool_choice: input.tool_choice ?? "auto" } : {}),
        ...(input.text ? { text: input.text } : {}),
      }),
      signal: AbortSignal.any([AbortSignal.timeout(600_000), ...(input.signal ? [input.signal] : [])]),
      cache: "no-store",
    });
    return await readChatGptStream(response, input.onText);
  } catch (error) {
    if (input.signal?.aborted || error instanceof ChatGptError) throw error;
    throw new ChatGptError("A conexão com o ChatGPT foi interrompida. Retome o pedido.");
  }
}
