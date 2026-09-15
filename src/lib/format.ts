import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DEFAULT_TZ, keyToDbDate, type DateKey } from "./time";

const pad = (n: number) => String(n).padStart(2, "0");

/** 45 → "45min", 150 → "2h30", 120 → "2h" */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
}

/** Minute of day → "08:00" */
export function formatClock(minute: number): string {
  if (minute === 1440) return "24:00";
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "08:30" → 510. Accepts "24:00" as end of day. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h === 24 && m === 0) return 1440;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Seconds → "23:45" or "1:23:45" */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}%`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(key: string, options: Intl.DateTimeFormatOptions) {
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("pt-BR", options);
    dateFormatters.set(key, f);
  }
  return f;
}

/** "13 de setembro de 2026" */
export function formatDateLong(date: Date, tz: string = DEFAULT_TZ): string {
  return dateFormatter(`long:${tz}`, { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Calendar dates stored as UTC midnight (@db.Date): "18 de janeiro de 2027", never shifted by time zone. */
export function formatCalendarDate(date: Date): string {
  return formatDateLong(date, "UTC");
}

/** "13 de set." */
export function formatDateShort(date: Date, tz: string = DEFAULT_TZ): string {
  return dateFormatter(`short:${tz}`, { timeZone: tz, day: "numeric", month: "short" }).format(date);
}

/** "13/09/2026" */
export function formatDateNumeric(date: Date, tz: string = DEFAULT_TZ): string {
  return dateFormatter(`num:${tz}`, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** "13/09, 14:30" */
export function formatDateTime(date: Date, tz: string = DEFAULT_TZ): string {
  return dateFormatter(`dt:${tz}`, {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** DateKey → "segunda-feira, 14 de setembro" */
export function formatDayKey(key: DateKey, style: "long" | "weekday" | "short" | "dayMonth" = "long"): string {
  const d = keyToDbDate(key);
  if (style === "weekday") return dateFormatter("wd", { timeZone: "UTC", weekday: "long" }).format(d);
  if (style === "short") return dateFormatter("ks", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(d);
  if (style === "dayMonth") return dateFormatter("dm", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
  return dateFormatter("kl", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(d);
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "14 a 20 de setembro" or "28 de setembro a 4 de outubro" */
export function formatWeekRange(weekStart: DateKey): string {
  const start = keyToDbDate(weekStart);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const [sd, sm, ed, em] = [start.getUTCDate(), start.getUTCMonth(), end.getUTCDate(), end.getUTCMonth()];
  return sm === em ? `${sd} a ${ed} de ${MONTHS[em]}` : `${sd} de ${MONTHS[sm]} a ${ed} de ${MONTHS[em]}`;
}

export const WEEKDAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
export const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export function weekdayName(isoWeekday: number, short = false): string {
  const list = short ? WEEKDAY_SHORT : WEEKDAY_NAMES;
  return list[(isoWeekday - 1 + 7) % 7] ?? "";
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function timeAgo(date: Date): string {
  return formatDistanceToNowStrict(date, { locale: ptBR, addSuffix: true });
}
