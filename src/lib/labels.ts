/** pt-BR labels for persisted enums. Single source for every screen. */

export const ROUTINE_CATEGORY_LABEL = {
  SLEEP: "Sono",
  WORK: "Trabalho",
  COLLEGE: "Faculdade",
  SCHOOL: "Escola",
  COURSE: "Curso",
  COMMUTE: "Deslocamento",
  TRAINING: "Treino",
  STUDY: "Estudo",
  MEAL: "Alimentação",
  FAMILY: "Família",
  LEISURE: "Lazer",
  APPOINTMENT: "Compromisso",
  FREE: "Livre",
  OTHER: "Outro",
} as const;

export const ENERGY_LABEL = {
  VERY_HIGH: "Muito alta",
  HIGH: "Alta",
  NORMAL: "Normal",
  LOW: "Baixa",
  VERY_LOW: "Muito baixa",
} as const;

export const DAY_PERIOD_LABEL = {
  DAWN: "Madrugada (00h–06h)",
  MORNING: "Manhã (06h–12h)",
  AFTERNOON: "Tarde (12h–18h)",
  EVENING: "Noite (18h–24h)",
} as const;

export const SLOT_CLASS_LABEL = {
  A: "Alta performance",
  B: "Performance média",
  C: "Baixa exigência",
} as const;

export const SLOT_CLASS_HINT = {
  A: "Conteúdo novo, exatas, direito complexo, produção escrita",
  B: "Questões, videoaulas, exercícios, revisão ativa",
  C: "Flashcards, leitura, caderno de erros, revisão leve",
} as const;

export const PLAN_ITEM_KIND_LABEL = {
  NEW_CONTENT: "Teoria",
  QUESTIONS: "Questões",
  REVIEW: "Revisão",
  FLASHCARDS: "Flashcards",
  ERROR_NOTEBOOK: "Caderno de erros",
  SIMULATION: "Simulado",
  WRITING: "Redação",
} as const;

export const PLAN_ITEM_STATUS_LABEL = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  POSTPONED: "Adiada",
  SKIPPED: "Ignorada",
  CANCELED: "Cancelada",
  MISSED: "Não realizada",
} as const;

export const TOPIC_STATUS_LABEL = {
  NOT_STUDIED: "Não estudado",
  IN_PROGRESS: "Em andamento",
  STUDIED: "Estudado",
  REVIEWED: "Revisado",
} as const;

export const COMPETITION_KIND_LABEL = { PUBLIC: "Público", MILITARY: "Militar" } as const;

export const COMPETITION_STATUS_LABEL = {
  EXPECTED: "Previsto",
  EDITAL_PUBLISHED: "Edital publicado",
  REGISTRATION_OPEN: "Inscrições abertas",
  REGISTRATION_CLOSED: "Inscrições encerradas",
  EXAM_DONE: "Prova realizada",
  CONCLUDED: "Concluído",
} as const;

export const ENROLLMENT_STATUS_LABEL = { ACTIVE: "Ativo", PAUSED: "Pausado", ARCHIVED: "Arquivado" } as const;

export const STAGE_STATUS_LABEL = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  PASSED: "Aprovado",
  FAILED: "Não aprovado",
  NOT_APPLICABLE: "Não se aplica",
} as const;

export const VERIFICATION_LABEL = {
  VERIFIED: "Verificado",
  UNVERIFIED: "Informação não verificada",
  USER_PROVIDED: "Informado por você",
} as const;

export const DIFFICULTY_LABEL = { EASY: "Fácil", MEDIUM: "Média", HARD: "Difícil" } as const;

export const CONTENT_SOURCE_LABEL = {
  OFFICIAL: "Prova oficial",
  LICENSED: "Conteúdo licenciado",
  PLATFORM: "Questão autoral Vértice",
  USER: "Inserida por você",
  GENERATED: "Gerada por IA (não oficial)",
  DEMO: "Demonstração",
} as const;

export const ERROR_REASON_LABEL = {
  DID_NOT_KNOW: "Não sabia",
  CONFUSED_CONCEPTS: "Confundi conceitos",
  INTERPRETATION: "Interpretação",
  INATTENTION: "Falta de atenção",
  CALCULATION: "Erro de cálculo",
  FORGOT_FORMULA: "Esqueci fórmula",
  GUESS: "Chute",
  OTHER: "Outro",
} as const;

export const FLASHCARD_TYPE_LABEL = {
  CONCEPT: "Conceito",
  FORMULA: "Fórmula",
  TRAP: "Pegadinha",
  PERSONAL_ERROR: "Erro pessoal",
  RULE: "Regra",
  DEFINITION: "Definição",
  FROM_QUESTION: "Questão transformada",
} as const;

export const REVIEW_RATING_LABEL = { AGAIN: "Errei", HARD: "Difícil", GOOD: "Bom", EASY: "Fácil" } as const;

export const GOAL_KIND_LABEL = {
  HOURS: "Horas de estudo",
  QUESTIONS: "Questões",
  TOPICS: "Tópicos estudados",
  FLASHCARDS: "Flashcards revisados",
  SIMULATIONS: "Simulados",
  REVIEWS: "Sessões de revisão",
} as const;

export const GOAL_PERIOD_LABEL = { DAILY: "por dia", WEEKLY: "por semana", MONTHLY: "por mês" } as const;

export const NOTIFICATION_TYPE_LABEL = {
  FLASHCARDS_DUE: "Flashcards pendentes",
  SIMULATION_SOON: "Simulados agendados",
  EXAM_COUNTDOWN: "Contagem para a prova",
  TOPIC_STALE: "Tópicos sem revisão",
  PLAN_RECALCULATED: "Plano recalculado",
  GOAL: "Metas",
  RECOMMENDATION: "Recomendações",
  SYSTEM: "Avisos do sistema",
} as const;

export const CALENDAR_EVENT_TYPE_LABEL = {
  SESSION: "Sessão",
  REVIEW: "Revisão",
  SIMULATION: "Simulado",
  EXAM: "Prova",
  REGISTRATION: "Inscrição",
  EDITAL: "Edital",
  TAF: "TAF",
  GOAL: "Meta",
  CUSTOM: "Evento",
} as const;

export const MODALITY_LABEL = {
  RUN: "Corrida",
  PULL_UP: "Barra",
  PUSH_UP: "Flexão",
  SIT_UP: "Abdominal",
  SWIM: "Natação",
  OTHER: "Outro",
} as const;

export const UNIT_LABEL = { SECONDS: "tempo", REPS: "repetições", METERS: "metros", KILOGRAMS: "kg" } as const;
