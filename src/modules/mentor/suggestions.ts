/** Shared by server and client. Each key has a deterministic analysis that works without AI. */
export const MENTOR_ANALYSES = [
  { key: "plano_hoje", question: "Por que estes conteúdos estão no meu plano hoje?" },
  { key: "pontos_fracos", question: "Onde estou perdendo mais pontos?" },
  { key: "semana", question: "Como está minha semana até agora?" },
  { key: "rotina", question: "Minha rotina está sustentável?" },
  { key: "redistribuir", question: "Redistribua as sessões que perdi nesta semana." },
] as const;

export type MentorAnalysisKey = (typeof MENTOR_ANALYSES)[number]["key"];

/** Conversation starters that need the AI (free interpretation of the student's words). */
export const MENTOR_AI_PROMPTS = [
  "Tenho faculdade das 8h às 12h, academia às 18h e consigo estudar até as 23h. Ajuste minha rotina.",
  "Minha prova é daqui a 70 dias e estou mal em Física. O que devo priorizar?",
];

export const MENTOR_MESSAGE_MAX = 2000;
