/**
 * Time-zone aware calendar helpers built on Intl (no extra dependency).
 *
 * The plan stores `date` (@db.Date, UTC midnight) + minutes from *local*
 * midnight. A DateKey ("YYYY-MM-DD") is the canonical in-memory form of a
 * local calendar day.
 */

export const DEFAULT_TZ = "America/Sao_Paulo";
export type DateKey = string;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(date: Date, tz: string = DEFAULT_TZ) {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    isoWeekday: WEEKDAYS[out.weekday ?? "Mon"] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(date: Date, tz: string = DEFAULT_TZ): DateKey {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function parseKey(key: DateKey) {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function isDateKey(value: string): value is DateKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(keyToDbDate(value).getTime());
}

/** Date at UTC midnight, the representation Prisma uses for @db.Date. */
export function keyToDbDate(key: DateKey): Date {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Reads a @db.Date value back into a DateKey. */
export function dbDateToKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = keyToDbDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dbDateToKey(d);
}

export function diffDays(from: DateKey, to: DateKey): number {
  return Math.round((keyToDbDate(to).getTime() - keyToDbDate(from).getTime()) / 86_400_000);
}

export function isoWeekdayOfKey(key: DateKey): number {
  const js = keyToDbDate(key).getUTCDay();
  return js === 0 ? 7 : js;
}

export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, 1 - isoWeekdayOfKey(key));
}

export function weekKeys(weekStart: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function tzOffsetMinutes(date: Date, tz: string = DEFAULT_TZ): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    offsetFormatters.set(tz, f);
  }
  const name = f.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** The UTC instant of a local wall-clock time. */
export function zonedToUtc(key: DateKey, minuteOfDay: number, tz: string = DEFAULT_TZ): Date {
  const { y, m, d } = parseKey(key);
  const guess = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  const offset = tzOffsetMinutes(new Date(guess), tz);
  const result = guess - offset * 60_000;
  const corrected = tzOffsetMinutes(new Date(result), tz);
  return new Date(corrected === offset ? result : guess - corrected * 60_000);
}

export function minuteOfDay(date: Date, tz: string = DEFAULT_TZ): number {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

export function localNow(tz: string = DEFAULT_TZ, now: Date = new Date()) {
  const p = zonedParts(now, tz);
  return {
    key: `${p.year}-${pad(p.month)}-${pad(p.day)}` as DateKey,
    minute: p.hour * 60 + p.minute,
    hour: p.hour,
    isoWeekday: p.isoWeekday,
  };
}

export type DayPeriodName = "DAWN" | "MORNING" | "AFTERNOON" | "EVENING";

export const DAY_PERIODS: { period: DayPeriodName; start: number; end: number }[] = [
  { period: "DAWN", start: 0, end: 360 },
  { period: "MORNING", start: 360, end: 720 },
  { period: "AFTERNOON", start: 720, end: 1080 },
  { period: "EVENING", start: 1080, end: 1440 },
];

export function dayPeriodOf(minute: number): DayPeriodName {
  return DAY_PERIODS.find((p) => minute >= p.start && minute < p.end)?.period ?? "EVENING";
}

/** Calendar days from today until `target` in the user's zone (negative if past). */
/**
 * Days from today (in tz) to a calendar date stored as UTC midnight (@db.Date).
 * Converting such a value to the local zone would land on the previous day west of UTC.
 */
export function daysUntilDate(calendarDate: Date, tz: string = DEFAULT_TZ, now: Date = new Date()): number {
  return diffDays(toDateKey(now, tz), dbDateToKey(calendarDate));
}

export function daysUntil(target: Date, tz: string = DEFAULT_TZ, now: Date = new Date()): number {
  return diffDays(toDateKey(now, tz), toDateKey(target, tz));
}
