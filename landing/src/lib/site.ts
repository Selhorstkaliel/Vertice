const trimSlash = (value: string | undefined) => value?.trim().replace(/\/+$/, "") || undefined;

export const SITE = {
  name: "VÉRTICE",
  slogan: "Precisão para chegar mais alto.",
  title: "VÉRTICE | Preparação inteligente para concursos",
  description:
    "Organize edital, rotina, questões, revisões, simulados e desempenho em uma única plataforma de preparação para concursos públicos e militares.",
  /** URL pública da landing. Sem ela, canonical não é emitido. */
  url: trimSlash(import.meta.env.VITE_SITE_URL),
  /**
   * URL do aplicativo (Next.js). Em desenvolvimento, sem a variável, usa o endereço padrão do app local.
   * Em produção não há padrão: sem ela, as páginas de acesso explicam que o acesso não está disponível.
   */
  appUrl: trimSlash(import.meta.env.VITE_APP_URL) ?? (import.meta.env.DEV ? "http://localhost:3000" : undefined),
} as const;

/** Caminhos reais do aplicativo VÉRTICE. */
export const APP_PATHS = {
  login: "/entrar",
  signup: "/cadastro",
  dashboard: "/painel",
} as const;

export const appLink = (path: (typeof APP_PATHS)[keyof typeof APP_PATHS]) => (SITE.appUrl ? `${SITE.appUrl}${path}` : undefined);
