/**
 * Depoimentos verificados. Só entram aqui relatos reais, com autorização registrada.
 * Com a lista vazia, a seção não aparece em produção; em desenvolvimento mostra o estado preparado.
 */
export type Testimonial = {
  id: string;
  quote: string;
  author: string;
  /** Contexto declarado pelo autor, como o concurso que prepara. */
  context?: string;
  /** Data em que a autorização de uso foi registrada (ISO). */
  consentAt: string;
};

export const testimonials: Testimonial[] = [];
