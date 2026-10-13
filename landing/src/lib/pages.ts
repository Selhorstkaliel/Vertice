import { ROUTES } from "./routes.ts";

export type PageMeta = {
  path: string;
  /** Título sem o sufixo da marca. Ausente na home, que usa o título completo do site. */
  title?: string;
  description?: string;
  /** Entra no sitemap e é pré-renderizada no build. */
  indexable: boolean;
};

const DESCRIPTION =
  "Organize edital, rotina, questões, revisões, simulados e desempenho em uma única plataforma de preparação para concursos públicos e militares.";

/** Fonte única das páginas: rotas, metadados, sitemap e pré-renderização. */
export const PAGES: PageMeta[] = [
  { path: ROUTES.home, description: DESCRIPTION, indexable: true },
  {
    path: ROUTES.features,
    title: "Recursos",
    description:
      "Edital verticalizado, plano adaptativo, questões, flashcards, caderno de erros, simulados, desempenho, calendário, TAF e Mentor Vértice.",
    indexable: true,
  },
  {
    path: ROUTES.plans,
    title: "Planos",
    description: "Conheça os planos do VÉRTICE para organizar, acompanhar e ajustar sua preparação para concursos.",
    indexable: true,
  },
  {
    path: ROUTES.contests,
    title: "Concursos",
    description: "Organize concursos públicos, militares, policiais, fiscais, bancários e de empresas públicas com os dados do seu edital.",
    indexable: true,
  },
  { path: ROUTES.about, title: "Sobre", description: "Uma plataforma de preparação autônoma para concursos públicos e militares.", indexable: true },
  { path: ROUTES.contact, title: "Contato", description: "Os canais oficiais de atendimento do VÉRTICE.", indexable: true },
  { path: ROUTES.terms, title: "Termos de uso", description: "As condições de uso da plataforma VÉRTICE.", indexable: true },
  { path: ROUTES.privacy, title: "Política de privacidade", description: "Como os dados da sua preparação são tratados.", indexable: true },
  { path: ROUTES.login, title: "Entrar", indexable: false },
  { path: ROUTES.signup, title: "Criar conta", indexable: false },
  { path: ROUTES.dashboard, title: "Painel", indexable: false },
  { path: "/404", title: "Página não encontrada", indexable: false },
];

export const pageMeta = (path: string): PageMeta | undefined => PAGES.find((p) => p.path === path);

export const indexablePaths = PAGES.filter((p) => p.indexable).map((p) => p.path);
