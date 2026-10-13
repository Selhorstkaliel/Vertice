/**
 * Planos da landing. Preços vêm só daqui — nenhum valor deve ser escrito nos componentes.
 * `null` exibe "Em breve". Para publicar um valor, informe o preço em reais (ex.: 49.9).
 */

export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  id: "start" | "pro" | "performance";
  name: string;
  summary: string;
  price: Record<BillingCycle, number | null>;
  features: string[];
  highlighted?: boolean;
};

export const pricingConfig = {
  /**
   * Enquanto `false`, a seção esconde o alternador de cobrança (que não teria efeito sem preços)
   * e mostra o aviso abaixo. Passe para `true` no dia em que os valores forem publicados.
   */
  published: false,
  /** Aviso exibido enquanto os planos não estão publicados. */
  draftNotice: "Os planos ainda estão em definição. Até a publicação dos valores, a plataforma não cobra pelo uso.",
  currency: "BRL",
  /** Texto do desconto anual. Deixe `null` até existir um desconto definido. */
  yearlyNote: null as string | null,
};

export const plans: Plan[] = [
  {
    id: "start",
    name: "VÉRTICE Start",
    summary: "Para organizar a preparação e criar constância.",
    price: { monthly: null, yearly: null },
    features: ["Edital verticalizado", "Planejamento semanal", "Questões", "Flashcards", "Caderno de erros"],
  },
  {
    id: "pro",
    name: "VÉRTICE Pro",
    summary: "Para quem quer medir, revisar e ajustar com dados.",
    price: { monthly: null, yearly: null },
    features: ["Tudo do Start", "Simulados", "Relatórios de desempenho", "Replanejamento", "Calendário e metas"],
    highlighted: true,
  },
  {
    id: "performance",
    name: "VÉRTICE Performance",
    summary: "Para a preparação completa, incluindo etapas físicas.",
    price: { monthly: null, yearly: null },
    features: ["Tudo do Pro", "Mentor Vértice", "Área militar e TAF"],
  },
];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: pricingConfig.currency });

export const formatPrice = (value: number) => currency.format(value);
