import type { BetterWhen, MeasureUnit } from "./taf";

/**
 * Turns one physical test index as printed in an edital into a measurable
 * target (pure). Editais write indices freely ("12 repetições", "2.400 m em
 * 12 min", "13'30''", "50 m nado livre em 45 s"); what cannot be read with
 * confidence keeps a null target, and the raw text stays visible.
 */

export type Modality = "RUN" | "PULL_UP" | "PUSH_UP" | "SIT_UP" | "SWIM" | "OTHER";
export type TafSex = "MALE" | "FEMALE" | "BOTH";

export interface InterpretedIndex {
  modality: Modality;
  unit: MeasureUnit | null;
  betterWhen: BetterWhen | null;
  target: number | null;
  distanceMeters: number | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function modalityOf(test: string): Modality {
  const t = norm(test);
  if (/nata|nado|piscina/.test(t)) return "SWIM";
  if (/barra/.test(t)) return "PULL_UP";
  if (/flex.*(braco|solo)|apoio de frente|flexao/.test(t)) return "PUSH_UP";
  if (/abdomina/.test(t)) return "SIT_UP";
  if (/corrida|correr|cooper|marcha/.test(t)) return "RUN";
  return "OTHER";
}

/** "2.400" → 2400; "1,5" → 1.5. */
function number(text: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)/.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.includes(",") ? m[1]!.replace(",", ".") : m[1]!.replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

/** "12 min", "12'00''", "13:30", "13 min 30 s", "45 s", "1min30" → seconds. */
export function secondsOf(text: string): number | null {
  const t = norm(text).replace(/\s+/g, " ");
  const clock = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (clock) return clock[3] ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : Number(clock[1]) * 60 + Number(clock[2]);
  const minSec = /(\d+)\s*(?:min(?:utos?)?|'|’|′)\s*(?:e\s*)?(\d{1,2})?\s*(?:s|seg(?:undos?)?|"|''|’’|″)?/.exec(t);
  if (minSec && /min|'|’|′/.test(minSec[0])) return Number(minSec[1]) * 60 + (minSec[2] ? Number(minSec[2]) : 0);
  const sec = /(\d+(?:,\d+)?)\s*(?:s\b|seg(?:undos?)?|"|''|″)/.exec(t);
  if (sec) return Number(sec[1]!.replace(",", "."));
  return null;
}

function distanceOf(text: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(km|metros?|m)\b/.exec(norm(text));
  if (!m) return null;
  const n = number(m[1]!)!;
  return Math.round(m[2] === "km" ? n * 1000 : n);
}

export function interpretTafIndex(test: string, index: string, unitText: string): InterpretedIndex {
  const modality = modalityOf(test);
  const all = norm(`${index} ${unitText}`);
  const unit = norm(unitText);
  const base = { modality, distanceMeters: null as number | null };

  if (/repet|\brep\b|vezes|execuc|flexoes|abdominais/.test(all) || (/^\s*\d+\s*$/.test(index) && ["PULL_UP", "PUSH_UP", "SIT_UP"].includes(modality))) {
    const n = number(index);
    return { ...base, unit: "REPS", betterWhen: "HIGHER", target: n !== null && Number.isInteger(n) ? n : null };
  }
  if (/\bkg\b|quilo/.test(all)) return { ...base, unit: "KILOGRAMS", betterWhen: "HIGHER", target: number(index) };

  // Distance covered in a fixed time (Cooper: "2.400 m em 12 min", or "2.450" with the unit "metros" apart): the distance is the target.
  const bare = number(index);
  const distance = distanceOf(index) ?? (bare !== null && /\bkm\b|quilometro/.test(unit) ? Math.round(bare * 1000) : bare !== null && /metro|^m$/.test(unit.trim()) ? Math.round(bare) : null);
  const time = secondsOf(index) ?? (/(seg|min|tempo)/.test(unit) ? secondsOf(`${index} ${unitText}`) : null);
  if (distance !== null && (/\bem\b/.test(norm(index)) || /metro|\bm\b/.test(unit)) && !(/(seg|min|tempo)/.test(unit))) {
    return { ...base, unit: "METERS", betterWhen: "HIGHER", target: distance };
  }
  // A time limit: lower is better; the distance comes from the test name ("Corrida de 3.000 m").
  if (time !== null) return { ...base, unit: "SECONDS", betterWhen: "LOWER", target: time, distanceMeters: distanceOf(test) ?? distance };
  if (distance !== null) return { ...base, unit: "METERS", betterWhen: "HIGHER", target: distance };
  return { ...base, unit: null, betterWhen: null, target: null };
}

/** Indices that apply to a student of this sex (a "both" index applies to everyone). */
export function standardsForSex<T extends { sex: TafSex }>(standards: T[], sex: "MALE" | "FEMALE"): T[] {
  return standards.filter((s) => s.sex === sex || s.sex === "BOTH");
}

/** One index per test: editais list several age ranges; without the student's age, the first (youngest) is used. */
export function onePerTest<T extends { test: string; order: number }>(standards: T[]): T[] {
  const seen = new Set<string>();
  return [...standards].sort((a, b) => a.order - b.order).filter((s) => {
    const key = norm(s.test).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
