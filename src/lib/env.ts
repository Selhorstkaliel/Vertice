import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres."),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Which AI serves the Mentor: "anthropic" (Claude), "gemini" (Google) or any "openai-compatible" API.
  MENTOR_PROVIDER: z.enum(["anthropic", "gemini", "openai-compatible"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // Only for MENTOR_PROVIDER=openai-compatible (Groq, Ollama, OpenRouter…).
  MENTOR_BASE_URL: z.string().url().optional(),
  MENTOR_API_KEY: z.string().min(1).optional(),
  // Empty uses the provider default (claude-opus-5 or gemini-3.5-flash-lite).
  MENTOR_MODEL: z.string().min(1).optional(),
  // Optional: leave unset to use the API default effort.
  MENTOR_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  // "default" asks the API to retry safety-declined requests on a fallback model (beta).
  MENTOR_FALLBACKS: z.enum(["default", "off"]).default("default"),
  // Messages per student per local day sent to the AI provider.
  MENTOR_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(60),
  // Question bank: models (in order) that read exam PDFs and write questions. Needs GEMINI_API_KEY.
  // When one hits its free daily quota the next is tried.
  QUESTION_AI_MODELS: z
    .string()
    .default("gemini-3.5-flash-lite,gemini-3.6-flash")
    .transform((v) => v.split(",").map((m) => m.trim()).filter(Boolean)),
  // Only for tests against a local stand-in of the Gemini API.
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  // Exam PDFs, rendered pages and question figures. Keep it out of the public folder and back it up.
  STORAGE_DIR: z.string().min(1).default("storage"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
}

if (
  parsed.data.NODE_ENV === "production" &&
  parsed.data.SESSION_SECRET.startsWith("troque-este-valor")
) {
  throw new Error("SESSION_SECRET de exemplo não pode ser usado em produção.");
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
