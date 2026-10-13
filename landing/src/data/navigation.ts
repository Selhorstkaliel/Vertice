import { ROUTES, SECTIONS, sectionHref } from "@/lib/routes";

export type NavLink = { label: string; to: string };

export const primaryNav: NavLink[] = [
  { label: "Recursos", to: sectionHref(SECTIONS.features) },
  { label: "Como funciona", to: sectionHref(SECTIONS.howItWorks) },
  { label: "Concursos", to: sectionHref(SECTIONS.contests) },
  { label: "Desempenho", to: sectionHref(SECTIONS.performance) },
  { label: "Planos", to: sectionHref(SECTIONS.plans) },
  { label: "FAQ", to: sectionHref(SECTIONS.faq) },
];

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: "Produto",
    links: [
      { label: "Recursos", to: ROUTES.features },
      { label: "Concursos", to: ROUTES.contests },
      { label: "Desempenho", to: sectionHref(SECTIONS.performance) },
      { label: "Simulados", to: `${ROUTES.home}#simulados` },
      { label: "TAF", to: `${ROUTES.home}#militares` },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre", to: ROUTES.about },
      { label: "Contato", to: ROUTES.contact },
      { label: "Termos", to: ROUTES.terms },
      { label: "Privacidade", to: ROUTES.privacy },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Entrar", to: ROUTES.login },
      { label: "Criar conta", to: ROUTES.signup },
    ],
  },
];

/**
 * Redes sociais. Fica vazio até existirem URLs oficiais — o rodapé não renderiza a coluna sem elas.
 * Formato: { label: "GitHub", href: "https://github.com/..." }
 */
export const socialLinks: { label: string; href: string }[] = [];
