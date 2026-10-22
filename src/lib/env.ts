import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres."),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Public landing page (the Vite project in landing/). The app root redirects visitors there.
  // Empty means "not configured": the root falls back to the sign-in screen.
  NEXT_PUBLIC_LANDING_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  // Personal, locally hosted use of an eligible ChatGPT plan via official OAuth.
  // This overrides the AI provider for questions, essays, Mentor and edital reading.
  CHATGPT_PERSONAL_MODE: z.enum(["on", "off"]).default("off"),
  // Unset: use the model selected from the connected account's catalog at sign-in.
  CHATGPT_MODEL: z.string().min(1).optional(),
  // Which AI serves the Mentor: "anthropic" (Claude), "gemini" (Google) or any "openai-compatible" API.
  MENTOR_PROVIDER: z.enum(["anthropic", "gemini", "openai-compatible"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // The Gemini free tier may use content to improve Google's products: in production the Mentor
  // only runs on Gemini when this confirms a paid plan ("on").
  GEMINI_PAID_TIER: z.enum(["on", "off"]).default("off"),
  // Only for MENTOR_PROVIDER=openai-compatible (Groq, Ollama, OpenRouter…).
  MENTOR_BASE_URL: z.string().url().optional(),
  MENTOR_API_KEY: z.string().min(1).optional(),
  // Empty uses the provider default (claude-sonnet-5-5 or gemini-3.5-flash-lite).
  MENTOR_MODEL: z.string().min(1).optional(),
  // Unset: "medium" on Anthropic, the API default elsewhere.
  MENTOR_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  // Model calls (tool rounds included) per student message.
  MENTOR_MAX_ROUNDS: z.coerce.number().int().min(2).max(12).default(5),
  // "default" asks the API to retry safety-declined requests on a fallback model (beta).
  MENTOR_FALLBACKS: z.enum(["default", "off"]).default("default"),
  // Messages per student per local day sent to the AI provider.
  MENTOR_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  // Essay area (phase 3). Unset: on in development, off in production until calibration passes.
  ESSAYS_ENABLED: z.enum(["on", "off"]).optional(),
  // One variable per AI use, so the model can change without code. Defaults are starting points;
  // ESSAY_MODEL is decided by `npm run redacao:calibrar` (cheapest model that passes).
  ESSAY_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  ESSAY_REWRITE_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  ESSAY_THEME_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  ESSAY_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  // Who serves the essay features. Unset: Anthropic when ANTHROPIC_API_KEY exists, otherwise Gemini.
  ESSAY_PROVIDER: z.enum(["anthropic", "gemini"]).optional(),
  // Gemini models (in order) for essays; the next one is tried when a model's daily quota ends.
  ESSAY_GEMINI_MODELS: z
    .string()
    .default("gemini-3.6-flash,gemini-3.5-flash-lite")
    .transform((v) => v.split(",").map((m) => m.trim()).filter(Boolean)),
  // Corrections and paragraph rewrites per student per calendar month.
  ESSAY_MONTHLY_LIMIT: z.coerce.number().int().min(0).max(500).default(8),
  ESSAY_REWRITE_MONTHLY_LIMIT: z.coerce.number().int().min(0).max(1000).default(20),
  // Two corrections farther apart than this share of the maximum make the result "incerta".
  ESSAY_DISAGREEMENT_THRESHOLD: z.coerce.number().min(0.01).max(1).default(0.12),
  // Extra width added to each side of the estimated range, as a share of the maximum.
  ESSAY_RANGE_MARGIN: z.coerce.number().min(0).max(0.5).default(0.04),
  // Question bank: models (in order) that read exam PDFs and write questions. Needs GEMINI_API_KEY.
  // When one hits its free daily quota the next is tried.
  QUESTION_AI_MODELS: z
    .string()
    .default("gemini-3.5-flash-lite,gemini-3.6-flash")
    .transform((v) => v.split(",").map((m) => m.trim()).filter(Boolean)),
  // Only for tests against a local stand-in of the Gemini API.
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  // E-mail copies of stage deadline reminders. Stays "off" until an e-mail provider is set up in auth/mailer.
  STAGE_REMINDER_EMAILS: z.enum(["on", "off"]).default("off"),
  // Models (in order) that read editais; same Gemini key and quota fallback as QUESTION_AI_MODELS.
  EDITAL_AI_MODELS: z
    .string()
    .default("gemini-3.5-flash-lite,gemini-3.6-flash")
    .transform((v) => v.split(",").map((m) => m.trim()).filter(Boolean)),
  // Hours between two checks of the same source (be a polite visitor).
  EDITAIS_MIN_INTERVAL_HOURS: z.coerce.number().min(1).max(168).default(8),
  // Failures in a row before a source is flagged as needing attention.
  EDITAIS_FAILURES_ALERT: z.coerce.number().int().min(1).max(50).default(3),
  // Official DOU data (INLABS, Imprensa Nacional): optional complementary source.
  INLABS_EMAIL: z.string().email().optional(),
  INLABS_SENHA: z.string().min(1).optional(),
  // Only for the automated test against a local stand-in site; refused in production.
  EDITAIS_ALLOW_LOCAL_SOURCES: z.enum(["on", "off"]).default("off"),
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

if (parsed.data.NODE_ENV === "production" && parsed.data.EDITAIS_ALLOW_LOCAL_SOURCES === "on") {
  throw new Error("EDITAIS_ALLOW_LOCAL_SOURCES só pode ser usado em testes, nunca em produção.");
}

if (parsed.data.CHATGPT_PERSONAL_MODE === "on" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(parsed.data.NEXT_PUBLIC_APP_URL).hostname)) {
  throw new Error("CHATGPT_PERSONAL_MODE exige NEXT_PUBLIC_APP_URL local. Esta integração é para uso pessoal nesta máquina.");
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
