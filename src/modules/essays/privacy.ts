import type { EssayProvider } from "@/modules/ai/structured";

/** Shown on every screen that sends a student's essay to the AI provider. */
export function essayPrivacyNote(provider: EssayProvider) {
  const who = provider === "chatgpt" ? "à OpenAI, usando a franquia do seu plano ChatGPT conectado" : provider === "anthropic" ? "à Anthropic, empresa que fornece o modelo de IA Claude" : "ao Google, empresa que fornece o modelo de IA Gemini";
  return `Para corrigir, o texto da sua redação e o tema são enviados ${who}. Seus dados de cadastro não são enviados. A nota é uma estimativa feita por IA, não a nota oficial da banca.`;
}
