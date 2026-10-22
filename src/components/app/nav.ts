import {
  Activity,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  FileSearch,
  FileStack,
  FileText,
  ClipboardList,
  Coins,
  PlugZap,
  Clock3,
  Crosshair,
  Flag,
  Gauge,
  Layers,
  LineChart,
  ListChecks,
  ListTree,
  MessageSquareText,
  NotebookPen,
  PenLine,
  Scale,
  Settings,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  militaryOnly?: boolean;
  /** Question bank curation: only administrators see it. */
  adminOnly?: boolean;
  /** Essay area: only while ESSAYS_ENABLED is on (admins always). */
  essaysOnly?: boolean;
}

export const NAV_GROUPS: NavItem[][] = [
  [
    { href: "/painel", label: "Dashboard", icon: Gauge, keywords: ["início", "hoje", "painel"] },
    { href: "/missao", label: "Missão do dia", icon: Crosshair, keywords: ["missão", "hoje", "revisão rápida"] },
    { href: "/concursos", label: "Meus Concursos", icon: Flag, keywords: ["concurso", "prova"] },
    { href: "/edital", label: "Edital", icon: ListTree, keywords: ["verticalizado", "conteúdo", "tópicos"] },
    { href: "/editais", label: "Editais publicados", icon: FileText, keywords: ["edital", "retificação", "resultado", "documentos oficiais"] },
    { href: "/plano", label: "Plano", icon: CalendarCheck2, keywords: ["cronograma", "semana"] },
    { href: "/rotina", label: "Rotina", icon: Clock3, keywords: ["horários", "disponibilidade", "energia"] },
  ],
  [
    { href: "/questoes", label: "Questões", icon: ListChecks, keywords: ["exercícios", "banco"] },
    { href: "/flashcards", label: "Flashcards", icon: Layers, keywords: ["cartões", "revisão"] },
    { href: "/caderno-de-erros", label: "Caderno de Erros", icon: NotebookPen, keywords: ["erros"] },
    { href: "/simulados", label: "Simulados", icon: Timer, keywords: ["prova", "teste"] },
    { href: "/redacao", label: "Redação", icon: PenLine, keywords: ["redação", "texto", "correção", "tema"], essaysOnly: true },
  ],
  [
    { href: "/desempenho", label: "Desempenho", icon: LineChart, keywords: ["estatísticas", "relatório", "índice"] },
    { href: "/metas", label: "Metas", icon: Target, keywords: ["objetivos", "horas", "questões"] },
    { href: "/calendario", label: "Calendário", icon: CalendarDays, keywords: ["agenda", "eventos"] },
    { href: "/militar", label: "Militar / TAF", icon: Activity, keywords: ["taf", "etapas", "físico"], militaryOnly: true },
    { href: "/mentor", label: "Mentor", icon: MessageSquareText, keywords: ["assistente", "ia", "ajuda"] },
  ],
  [
    { href: "/admin/provas", label: "Provas oficiais", icon: FileStack, keywords: ["administração", "importar", "revisão", "gabarito"], adminOnly: true },
    { href: "/admin/regras", label: "Regras de pontuação", icon: Scale, keywords: ["administração", "nota de corte", "peso", "desconto"], adminOnly: true },
    { href: "/admin/etapas", label: "Itens das etapas", icon: ClipboardList, keywords: ["administração", "documentos", "inspeção", "prazos"], adminOnly: true },
    { href: "/admin/editais", label: "Editais", icon: FileSearch, keywords: ["administração", "edital", "retificação", "fontes"], adminOnly: true },
    { href: "/admin/redacao", label: "Rubricas e temas", icon: PenLine, keywords: ["administração", "redação", "rubrica", "tema"], adminOnly: true },
    { href: "/admin/ia", label: "Conexão de IA", icon: PlugZap, keywords: ["administração", "chatgpt", "openai", "conectar", "ia"], adminOnly: true },
    { href: "/admin/custos", label: "Custos de IA", icon: Coins, keywords: ["administração", "tokens", "custo", "consumo"], adminOnly: true },
  ],
];

export function visibleNavItem(item: NavItem, access: { showMilitary: boolean; isAdmin: boolean; showEssays?: boolean }) {
  return (!item.militaryOnly || access.showMilitary) && (!item.adminOnly || access.isAdmin) && (!item.essaysOnly || !!access.showEssays);
}

export const SETTINGS_ITEM: NavItem = { href: "/configuracoes", label: "Configurações", icon: Settings, keywords: ["conta", "tema", "privacidade"] };

/** Mobile bottom bar: what a student reaches for during the day. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/painel", label: "Hoje", icon: Gauge },
  { href: "/plano", label: "Plano", icon: CalendarCheck2 },
  { href: "/questoes", label: "Questões", icon: ListChecks },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
];

export const SESSION_ITEM: NavItem = { href: "/sessao", label: "Sessão de estudo", icon: BookOpenCheck };

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
