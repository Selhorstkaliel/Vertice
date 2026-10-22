import "server-only";
import { env } from "@/lib/env";
import { mentorProvider } from "@/modules/mentor/provider";
import { activeRegistration, type ChatGptState } from "./chatgpt-store";
import { chatGptStore, personalChatGpt } from "./chatgpt-auth";
import { chatGptModels, ChatGptError } from "./chatgpt";
import { loopbackRedirectUri } from "./chatgpt-connect";
import { editalAiReady, questionAiConfigured } from "./documents";
import { essayAiConfigured, essayProviderLabel } from "./structured";

const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const MODELS_TTL_MS = 10 * 60_000;
/** The account's model list barely changes; asking OpenAI on every settings render costs about a second. */
let modelsCache: { email: string | null; at: number; models: ChatGptStatus["models"] } | null = null;

export interface ChatGptStatus {
  personal: boolean;
  /** `.chatgpt/connection.enc` exists but does not open with the current SESSION_SECRET. */
  unreadable: boolean;
  connected: boolean;
  email: string | null;
  model: string | null;
  envModel: string | null;
  expiresAt: number | null;
  models: { slug: string; name: string }[];
  modelsError: string | null;
  accounts: { clientId: string; email: string | null; active: boolean; connected: boolean }[];
  /** Set when the page was opened by another host: the OAuth callback only reaches 127.0.0.1. */
  loopbackUrl: string | null;
  features: { name: string; detail: string; provider: string; ready: boolean }[];
}

/** One installation, one owner: the connection is shared by everything this local server runs. */
export async function chatGptStatus(host: string | null, path: string, withModels = true): Promise<ChatGptStatus> {
  const personal = personalChatGpt();
  let state: ChatGptState | null = null;
  let unreadable = false;
  try { state = await chatGptStore.read(); }
  catch { unreadable = true; }
  const registration = activeRegistration(state);
  const connected = personal && !!registration?.accessToken && registration.scopes.includes(PLAN_SCOPE);

  let models: ChatGptStatus["models"] = [];
  let modelsError: string | null = null;
  if (connected && withModels) {
    const email = registration?.email ?? null;
    if (modelsCache && modelsCache.email === email && Date.now() - modelsCache.at < MODELS_TTL_MS) models = modelsCache.models;
    else {
      try {
        models = (await chatGptModels()).map((m) => ({ slug: m.slug, name: m.display_name }));
        modelsCache = { email, at: Date.now(), models };
      } catch (error) { modelsError = error instanceof ChatGptError ? error.message : "falha de rede."; }
    }
  }

  const mentor = mentorProvider();
  return {
    personal,
    unreadable,
    connected,
    email: registration?.email ?? null,
    model: env.CHATGPT_MODEL ?? registration?.model ?? null,
    envModel: env.CHATGPT_MODEL ?? null,
    expiresAt: connected ? registration!.expiresAt : null,
    models,
    modelsError,
    accounts: (state?.registrations ?? []).map((r) => ({
      clientId: r.clientId, email: r.email ?? null, active: r.clientId === state?.activeClientId, connected: !!r.accessToken && r.scopes.includes(PLAN_SCOPE),
    })),
    loopbackUrl: loopbackRedirectUri(host) ? null : `http://127.0.0.1:${host?.split(":")[1] ?? "3000"}${path}`,
    features: [
      { name: "Leitura e interpretação de provas", detail: "Importa PDFs oficiais, lê enunciados, alternativas e figuras, e gera questões no estilo da banca.", ready: questionAiConfigured(), provider: personal ? "ChatGPT" : "Google (Gemini)" },
      { name: "Leitura de editais", detail: "Classifica documentos encontrados e extrai datas, vagas e retificações.", ready: editalAiReady(), provider: personal ? "ChatGPT" : "Google (Gemini)" },
      { name: "Correção e temas de redação", detail: "Duas correções independentes por redação e geração de temas.", ready: essayAiConfigured(), provider: essayProviderLabel() },
      { name: "Mentor", detail: "Conversa sobre plano, desempenho e rotina.", ready: mentor.configured, provider: mentor.label },
    ],
  };
}
