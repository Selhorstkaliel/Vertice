import "server-only";
import { env, isProduction } from "@/lib/env";
import { chatGptConfigured, personalChatGpt } from "@/modules/ai/chatgpt-auth";
import { chatGptModel } from "@/modules/ai/chatgpt";

export type MentorProviderId = "anthropic" | "gemini" | "openai-compatible" | "chatgpt";

export interface MentorProvider {
  id: MentorProviderId;
  /** Shown to students in the privacy notices. */
  label: string;
  model: string;
  configured: boolean;
  /** OpenAI-compatible endpoint root, e.g. https://…/v1beta/openai. */
  baseUrl: string | null;
  apiKey: string | null;
}

const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

export function mentorProvider(): MentorProvider {
  if (personalChatGpt()) return { id: "chatgpt", label: "OpenAI (seu plano ChatGPT)", model: chatGptModel(), configured: chatGptConfigured(), baseUrl: null, apiKey: null };
  switch (env.MENTOR_PROVIDER) {
    case "gemini":
      return {
        id: "gemini",
        label: "Google (Gemini)",
        model: env.MENTOR_MODEL ?? "gemini-3.5-flash-lite",
        // Student data never goes to the Gemini free tier in production.
        configured: !!env.GEMINI_API_KEY && (!isProduction || env.GEMINI_PAID_TIER === "on"),
        baseUrl: env.MENTOR_BASE_URL ?? GEMINI_OPENAI_BASE,
        apiKey: env.GEMINI_API_KEY ?? null,
      };
    case "openai-compatible": {
      const host = env.MENTOR_BASE_URL ? new URL(env.MENTOR_BASE_URL).host : "provedor não configurado";
      return {
        id: "openai-compatible",
        label: host,
        model: env.MENTOR_MODEL ?? "",
        // Local servers such as Ollama need no key; the URL and model are what matter.
        configured: !!env.MENTOR_BASE_URL && !!env.MENTOR_MODEL,
        baseUrl: env.MENTOR_BASE_URL ?? null,
        apiKey: env.MENTOR_API_KEY ?? null,
      };
    }
    default:
      return {
        id: "anthropic",
        label: "Anthropic",
        // Cheapest Claude model that passes `npm run mentor:check`; override with MENTOR_MODEL.
        model: env.MENTOR_MODEL ?? "claude-sonnet-5-5",
        configured: !!env.ANTHROPIC_API_KEY,
        baseUrl: null,
        apiKey: env.ANTHROPIC_API_KEY ?? null,
      };
  }
}

/** Student-facing sentence about where Mentor conversations are sent. */
export function mentorPrivacyNote(provider: MentorProvider = mentorProvider()) {
  if (provider.id === "chatgpt") return "Suas mensagens e os dados consultados são enviados à OpenAI usando a franquia do seu plano ChatGPT conectado. Gerencie o uso em https://chatgpt.com/#settings/Usage. A aplicação não acessa seu histórico de conversas do ChatGPT.";
  if (provider.id === "gemini") {
    return "Suas mensagens e os dados consultados em cada resposta são enviados ao Google (Gemini) para gerar a resposta. No plano gratuito da API do Gemini, o Google pode usar esse conteúdo para melhorar os próprios produtos.";
  }
  if (provider.id === "openai-compatible") {
    return `Suas mensagens e os dados consultados em cada resposta são enviados ao provedor de IA configurado neste servidor (${provider.label}) para gerar a resposta.`;
  }
  return "Suas mensagens e os dados consultados em cada resposta são enviados à Anthropic, provedora do modelo, para gerar a resposta.";
}
