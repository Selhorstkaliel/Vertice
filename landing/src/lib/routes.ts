/** Rotas da landing. O sitemap usa a mesma lista em seo.config.ts. */
export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/cadastro",
  dashboard: "/dashboard",
  features: "/recursos",
  plans: "/planos",
  contests: "/concursos",
  about: "/sobre",
  contact: "/contato",
  terms: "/termos",
  privacy: "/privacidade",
} as const;

/** Âncoras das seções da página inicial. */
export const SECTIONS = {
  features: "recursos",
  howItWorks: "como-funciona",
  contests: "concursos",
  performance: "desempenho",
  plans: "planos",
  faq: "faq",
} as const;

export type SectionId = (typeof SECTIONS)[keyof typeof SECTIONS];

export const sectionHref = (id: SectionId) => `${ROUTES.home}#${id}`;
