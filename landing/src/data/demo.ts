/**
 * Dados demonstrativos das telas da landing.
 * Nada aqui representa usuários, resultados ou estatísticas reais do VÉRTICE —
 * toda interface que usa estes valores exibe a etiqueta "Dados demonstrativos".
 * Os números são coerentes entre si para a página contar uma única história.
 */

export const demoGoal = {
  contest: "EFOMM 2027",
  daysToTarget: 214,
  planExecuted: 72,
  weekMinutes: 640,
  weekGoalMinutes: 720,
  questions: 1248,
  weekAccuracy: 78,
  target: 70,
};

export const subjects = [
  { name: "Matemática", accuracy: 82 },
  { name: "Português", accuracy: 74 },
  { name: "Inglês", accuracy: 68 },
  { name: "Física", accuracy: 61 },
];

export const todayPlan = [
  { time: "19:00", subject: "Matemática", topic: "Funções", kind: "Teoria", minutes: 50, status: "done" as const },
  {
    time: "20:00",
    subject: "Física",
    topic: "Dinâmica",
    kind: "Questões",
    minutes: 40,
    status: "current" as const,
    why: "58% nas últimas sessões, abaixo da meta de 70%.",
  },
  { time: "20:50", subject: "Física", topic: "Cinemática", kind: "Flashcards", minutes: 20, status: "next" as const },
];

export const nextReview = { subject: "Português", topic: "Regência verbal", when: "Amanhã, 19:00" };

/* ── Mentor ─────────────────────────────────────────────── */

export const mentorDemo = {
  message:
    "Seu desempenho em Física caiu nas últimas sessões enquanto Matemática permanece acima da meta. Considere redistribuir parte do próximo bloco de estudo para Física.",
  evidence: [
    { label: "Física, últimas 3 sessões", values: [68, 64, 58], tone: "danger" as const, summary: "68% → 58%" },
    { label: "Matemática, últimas 3 sessões", values: [80, 83, 82], tone: "positive" as const, summary: "acima da meta de 70%" },
    { label: "Tempo até a data-alvo", values: [], tone: "neutral" as const, summary: "214 dias" },
  ],
  adjustment: [
    { subject: "Física — Dinâmica", before: 80, after: 120 },
    { subject: "Matemática — Funções", before: 100, after: 60 },
  ],
};

/* ── Painel (semana × mês) ──────────────────────────────── */

export type Period = "week" | "month";

export const dashboardByPeriod: Record<
  Period,
  {
    netMinutes: number;
    netDelta: string;
    goalMinutes: number;
    accuracy: number;
    accuracyDelta: string;
    questions: number;
    goals: { done: number; total: number };
    consistency: { done: number; total: number; label: string };
    hours: { label: string; value: number }[];
    hoursCaption: string;
  }
> = {
  week: {
    netMinutes: 640,
    netDelta: "+1h 20min",
    goalMinutes: 720,
    accuracy: 78,
    accuracyDelta: "+4 p.p.",
    questions: 214,
    goals: { done: 3, total: 4 },
    consistency: { done: 4, total: 4, label: "dias planejados cumpridos" },
    hours: [
      { label: "Seg", value: 150 },
      { label: "Ter", value: 160 },
      { label: "Qua", value: 0 },
      { label: "Qui", value: 150 },
      { label: "Sex", value: 0 },
      { label: "Sáb", value: 180 },
      { label: "Dom", value: 0 },
    ],
    hoursCaption: "Tempo líquido por dia",
  },
  month: {
    netMinutes: 2290,
    netDelta: "+3h 10min",
    goalMinutes: 2880,
    accuracy: 74,
    accuracyDelta: "+9 p.p.",
    questions: 862,
    goals: { done: 11, total: 14 },
    consistency: { done: 15, total: 17, label: "dias planejados cumpridos" },
    hours: [
      { label: "S1", value: 520 },
      { label: "S2", value: 550 },
      { label: "S3", value: 580 },
      { label: "S4", value: 640 },
    ],
    hoursCaption: "Tempo líquido por semana",
  },
};

export const topicEvolution = [
  { subject: "Matemática", topic: "Funções", values: [71, 74, 79, 84], tone: "positive" as const },
  { subject: "Português", topic: "Regência verbal", values: [66, 69, 72, 75], tone: "positive" as const },
  { subject: "Física", topic: "Cinemática", values: [55, 57, 61, 63], tone: "warning" as const },
  { subject: "Física", topic: "Dinâmica", values: [64, 66, 61, 58], tone: "danger" as const },
];

export const pendingReviews = { total: 12, overdue: 3 };

/** Intensidade de estudo (0–3) nas últimas 8 semanas, de segunda a domingo. */
export const consistencyGrid: number[][] = [
  [2, 1, 0, 2, 0, 3, 0],
  [2, 2, 0, 1, 0, 2, 0],
  [1, 2, 0, 2, 0, 3, 1],
  [2, 2, 0, 2, 0, 0, 0],
  [3, 2, 0, 2, 0, 3, 0],
  [2, 3, 0, 2, 1, 3, 0],
  [3, 2, 0, 3, 0, 3, 0],
  [2, 3, 0, 2, 0, 3, 0],
];

/* ── Rotina ─────────────────────────────────────────────── */

export type AvailabilityDay = { id: string; day: string; short: string; from?: string; to?: string };

export const availability: AvailabilityDay[] = [
  { id: "seg", day: "Segunda", short: "Seg", from: "19:00", to: "22:00" },
  { id: "ter", day: "Terça", short: "Ter", from: "18:30", to: "21:30" },
  { id: "qua", day: "Quarta", short: "Qua" },
  { id: "qui", day: "Quinta", short: "Qui", from: "19:00", to: "22:00" },
  { id: "sex", day: "Sexta", short: "Sex" },
  { id: "sab", day: "Sábado", short: "Sáb", from: "08:00", to: "12:00" },
  { id: "dom", day: "Domingo", short: "Dom" },
];

/** Sequência usada para preencher os horários no exemplo de rotina. */
export const studyRotation = [
  { subject: "Matemática", kind: "Teoria" },
  { subject: "Física", kind: "Questões" },
  { subject: "Português", kind: "Teoria" },
  { subject: "Inglês", kind: "Questões" },
  { subject: "Física", kind: "Teoria" },
  { subject: "Matemática", kind: "Questões" },
] as const;

/* ── Área militar / TAF ─────────────────────────────────── */

export const tafDemo = [
  { name: "Corrida 12 min", unit: "m", current: 2450, goal: 2600, history: [2180, 2260, 2310, 2390, 2450] },
  { name: "Flexões", unit: "rep.", current: 28, goal: 30, history: [19, 22, 24, 26, 28] },
  { name: "Abdominais 1 min", unit: "rep.", current: 41, goal: 45, history: [33, 35, 38, 40, 41] },
  { name: "Barra fixa", unit: "rep.", current: 6, goal: 8, history: [3, 4, 4, 5, 6] },
];

/* ── Caderno de erros ───────────────────────────────────── */

export const errorEntries = [
  {
    id: "e1",
    subject: "Física",
    topic: "Dinâmica — Plano inclinado",
    excerpt: "Um bloco parte do repouso e desliza por um plano inclinado sem atrito. Determine a aceleração…",
    reason: "Esqueci a fórmula",
    date: "12 set",
    repeats: 3,
    review: "Revisar hoje",
    urgent: true,
  },
  {
    id: "e2",
    subject: "Português",
    topic: "Sintaxe — Regência verbal",
    excerpt: "Assinale a alternativa em que o verbo “assistir” está empregado de acordo com a norma-padrão…",
    reason: "Confundi conceitos",
    date: "09 set",
    repeats: 4,
    review: "Revisar hoje",
    urgent: true,
  },
  {
    id: "e3",
    subject: "Matemática",
    topic: "Geometria analítica — Distância ponto-reta",
    excerpt: "Calcule a distância do ponto P à reta r de equação 3x − 4y + 2 = 0…",
    reason: "Erro de cálculo",
    date: "10 set",
    repeats: 2,
    review: "Em 2 dias",
    urgent: false,
  },
  {
    id: "e4",
    subject: "Inglês",
    topic: "Reading — Inferência",
    excerpt: "According to the text, it can be inferred that the author…",
    reason: "Interpretação",
    date: "06 set",
    repeats: 1,
    review: "Em 5 dias",
    urgent: false,
  },
];

export const errorReasons = [
  { label: "Interpretação", value: 14 },
  { label: "Cálculo", value: 11 },
  { label: "Conceitos", value: 9 },
  { label: "Fórmula", value: 7 },
  { label: "Desatenção", value: 5 },
];

/* ── Simulados ──────────────────────────────────────────── */

export const simulationDemo = {
  title: "Simulado 5 — Matemática e Física",
  kind: "Personalizado",
  limitMinutes: 240,
  usedMinutes: 206,
  questions: 40,
  correct: 29,
  bySubject: [
    { name: "Matemática", correct: 16, total: 20 },
    { name: "Física", correct: 13, total: 20 },
  ],
  history: [
    { label: "S1", value: 58 },
    { label: "S2", value: 61 },
    { label: "S3", value: 66 },
    { label: "S4", value: 69 },
    { label: "S5", value: 72.5 },
  ],
};

/* ── Performance ────────────────────────────────────────── */

export const weeklyAccuracy = [
  { label: "Semana 1", value: 58 },
  { label: "Semana 2", value: 63 },
  { label: "Semana 3", value: 69 },
  { label: "Semana 4", value: 74 },
  { label: "Semana 5", value: 78 },
];

export const performanceHighlights = [
  { label: "Consistência", value: 12, prefix: "+", suffix: "%", hint: "em relação à semana 1" },
  { label: "Taxa de acertos", value: 78, suffix: "%", hint: "na semana 5" },
  { label: "Questões", value: 1248, hint: "respondidas em 5 semanas" },
  { label: "Horas", value: 46, suffix: "h", hint: "de estudo líquido" },
];

/* ── Edital verticalizado ───────────────────────────────── */

export type TopicStatus = "Estudado" | "Revisado" | "Em andamento" | "Não iniciado";

export const editalDemo = [
  {
    subject: "Matemática",
    weight: 3,
    progress: 64,
    topics: [
      { name: "Funções", status: "Revisado" as TopicStatus, priority: "Média" },
      { name: "Trigonometria", status: "Em andamento" as TopicStatus, priority: "Alta" },
      { name: "Geometria analítica", status: "Não iniciado" as TopicStatus, priority: "Alta" },
    ],
  },
  {
    subject: "Física",
    weight: 3,
    progress: 41,
    topics: [
      { name: "Cinemática", status: "Estudado" as TopicStatus, priority: "Média" },
      { name: "Dinâmica", status: "Em andamento" as TopicStatus, priority: "Alta" },
    ],
  },
  { subject: "Português", weight: 2, progress: 58, topics: [] },
  { subject: "Inglês", weight: 1, progress: 47, topics: [] },
];
