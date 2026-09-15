import {
  Activity,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  FileStack,
  Clock3,
  Flag,
  Gauge,
  Layers,
  LineChart,
  ListChecks,
  ListTree,
  MessageSquareText,
  NotebookPen,
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
}

export const NAV_GROUPS: NavItem[][] = [
  [
    { href: "/painel", label: "Dashboard", icon: Gauge, keywords: ["início", "hoje", "painel"] },
    { href: "/concursos", label: "Meus Concursos", icon: Flag, keywords: ["concurso", "prova"] },
    { href: "/edital", label: "Edital", icon: ListTree, keywords: ["verticalizado", "conteúdo", "tópicos"] },
    { href: "/plano", label: "Plano", icon: CalendarCheck2, keywords: ["cronograma", "semana"] },
    { href: "/rotina", label: "Rotina", icon: Clock3, keywords: ["horários", "disponibilidade", "energia"] },
  ],
  [
    { href: "/questoes", label: "Questões", icon: ListChecks, keywords: ["exercícios", "banco"] },
    { href: "/flashcards", label: "Flashcards", icon: Layers, keywords: ["cartões", "revisão"] },
    { href: "/caderno-de-erros", label: "Caderno de Erros", icon: NotebookPen, keywords: ["erros"] },
    { href: "/simulados", label: "Simulados", icon: Timer, keywords: ["prova", "teste"] },
  ],
  [
    { href: "/desempenho", label: "Desempenho", icon: LineChart, keywords: ["estatísticas", "relatório", "índice"] },
    { href: "/metas", label: "Metas", icon: Target, keywords: ["objetivos", "horas", "questões"] },
    { href: "/calendario", label: "Calendário", icon: CalendarDays, keywords: ["agenda", "eventos"] },
    { href: "/militar", label: "Militar / TAF", icon: Activity, keywords: ["taf", "etapas", "físico"], militaryOnly: true },
    { href: "/mentor", label: "Mentor", icon: MessageSquareText, keywords: ["assistente", "ia", "ajuda"] },
  ],
  [{ href: "/admin/provas", label: "Provas oficiais", icon: FileStack, keywords: ["administração", "importar", "revisão", "gabarito"], adminOnly: true }],
];

export function visibleNavItem(item: NavItem, access: { showMilitary: boolean; isAdmin: boolean }) {
  return (!item.militaryOnly || access.showMilitary) && (!item.adminOnly || access.isAdmin);
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
