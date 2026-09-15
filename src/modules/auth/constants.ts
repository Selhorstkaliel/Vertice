// Shared by middleware (edge) and server code — keep free of Node-only imports.

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-vertice_session" : "vertice_session";

export const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 86_400_000;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const PUBLIC_AUTH_ROUTES = ["/entrar", "/cadastro", "/recuperar-senha", "/redefinir-senha"];

export const PROTECTED_PREFIXES = [
  "/painel",
  "/concursos",
  "/edital",
  "/plano",
  "/rotina",
  "/questoes",
  "/flashcards",
  "/caderno-de-erros",
  "/simulados",
  "/desempenho",
  "/calendario",
  "/metas",
  "/militar",
  "/mentor",
  "/configuracoes",
  "/perfil",
  "/notificacoes",
  "/admin",
  "/sessao",
  "/primeiros-passos",
];

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeRedirectPath(value: unknown, fallback = "/painel"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (PUBLIC_AUTH_ROUTES.some((r) => value.startsWith(r))) return fallback;
  return value;
}
