import type { OfficialKeyEntry } from "./draft-check";

/** One block of an official answer key, as printed: a version (colour/type) and a subject. */
export interface KeySection {
  version: string;
  section: string;
  answers: { number: number; label: string; annulled: boolean }[];
}

/** A subject block inside an exam paper, by question number. */
export interface PaperSection {
  subject: string;
  from: number;
  to: number;
}

export type SectionKeyEntry = OfficialKeyEntry & { section: string };

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Final letter of a key cell: "C", "(c)", "Alterada de E para D" → "D". Null when there is none. */
export function keyLetter(raw: string): string | null {
  const changed = /para\s+\(?([A-Ea-e])\)?/.exec(raw);
  if (changed?.[1]) return changed[1].toUpperCase();
  const letter = /^\s*\(?([A-Ea-e])\)?\s*$/.exec(raw);
  return letter?.[1] ? letter[1].toUpperCase() : null;
}

const tokens = (value: string) => normalizeName(value).split(" ").filter(Boolean);

/**
 * Only the words that tell versions apart count: in "VERSÃO A / VERSÃO B" the
 * shared "versão" says nothing, the letter decides.
 */
function versionMatches(paperVersion: string, keyVersion: string, allVersions: string[]) {
  const distinctVersions = [...new Set(allVersions.map(normalizeName))];
  if (distinctVersions.length <= 1) return true;
  const common = new Set(tokens(distinctVersions[0]!).filter((t) => distinctVersions.every((v) => v.split(" ").includes(t))));
  const distinctive = tokens(keyVersion).filter((t) => !common.has(t));
  if (distinctive.length === 0) return false;
  const paper = new Set(tokens(paperVersion));
  return distinctive.every((t) => paper.has(t));
}

/** Words that say nothing about the subject in key headings like "2º Dia - Prova de Língua Portuguesa". */
const GENERIC_WORDS = new Set(["dia", "prova", "provas", "lingua", "parte", "questoes", "objetiva", "objetivas", "conhecimentos", "caderno", "area", "geral"]);
const subjectWords = (value: string) => tokens(value).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));

/**
 * Whether two subject labels name the same subject: "Língua Portuguesa" is in
 * "Física e Português" (shared stem), "Matemática" is not in "1º Dia".
 */
export function sameSubject(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const wx = subjectWords(a);
  const wy = subjectWords(b);
  const stem = (w: string) => w.slice(0, Math.min(6, w.length));
  return wx.some((p) => wy.some((q) => p === q || (p.length >= 6 && q.length >= 6 && stem(p) === stem(q))));
}

/**
 * The model's description of the paper is a guess; the official key is not.
 * When the key has a single block for this version (one subject list for the
 * whole paper), its count wins and a section map that leaves numbers out is
 * dropped. Keys that print several days side by side cannot tell the count.
 */
export function reconcileWithKey(paperVersion: string, sections: KeySection[], layout: PaperSection[], expected: number | null, maxQuestions: number) {
  const blocks = resolvePaperKey(paperVersion, [], sections).entries;
  const blockNames = new Set(blocks.map((e) => e.section));
  if (blockNames.size !== 1) return { expected, layout };
  const keyCount = Math.max(0, ...blocks.map((e) => e.number));
  const total = keyCount > (expected ?? 0) && keyCount <= maxQuestions ? keyCount : expected;
  const covered = new Set(layout.flatMap((s) => Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i)));
  const complete = total === null || layout.length === 0 || Array.from({ length: total }, (_, i) => i + 1).every((n) => covered.has(n));
  return { expected: total, layout: complete ? layout : [] };
}

/**
 * Picks the key entries that belong to one paper. Keys usually print every
 * version and subject side by side, and numbering can restart per day, so
 * entries are matched by version, then by subject name or number range. The
 * same number may remain in two subjects (e.g. two days in one key); the
 * question's own subject settles it in `keyForQuestion`.
 */
export function resolvePaperKey(paperVersion: string, layout: PaperSection[], sections: KeySection[]): { entries: SectionKeyEntry[]; note: string | null } {
  const versions = [...new Set(sections.map((s) => normalizeName(s.version)))];
  let candidates = sections.filter((s) => versionMatches(paperVersion, s.version, sections.map((x) => x.version)));
  if (candidates.length === 0 && versions.length <= 1) candidates = sections;
  if (candidates.length === 0) return { entries: [], note: `Nenhuma versão do gabarito corresponde a "${paperVersion}". Versões no gabarito: ${[...new Set(sections.map((s) => s.version))].join(", ")}.` };

  const toEntries = (s: KeySection, from = -Infinity, to = Infinity): SectionKeyEntry[] =>
    s.answers
      .filter((a) => a.number >= from && a.number <= to)
      .map((a) => ({ number: a.number, label: a.annulled ? null : keyLetter(a.label), annulled: a.annulled, section: s.section }));

  const chosen: SectionKeyEntry[] = [];
  const missing: string[] = [];
  if (layout.length === 0) {
    candidates.forEach((s) => chosen.push(...toEntries(s)));
  } else {
    for (const part of layout) {
      const byName = candidates.find((s) => sameSubject(s.section, part.subject));
      const covering = candidates.filter((s) => s.answers.some((a) => a.number >= part.from && a.number <= part.to));
      const section = byName ?? (covering.length === 1 ? covering[0] : undefined);
      if (!section) missing.push(part.subject);
      else chosen.push(...toEntries(section, part.from, part.to));
    }
  }
  return { entries: chosen, note: missing.length ? `Gabarito sem a parte de ${missing.join(", ")}.` : null };
}

/**
 * Key entries to check one question against: every number appears once, and
 * when a number exists in more than one subject the one matching the question's
 * subject names wins. An unresolved tie drops that number (reported as missing).
 */
export function keyForQuestion(entries: SectionKeyEntry[], number: number | null, subjectHints: (string | null | undefined)[]): OfficialKeyEntry[] {
  const same = entries.filter((e) => e.number === number);
  const others = entries.filter((e) => e.number !== number);
  if (same.length <= 1) return entries;
  const hints = subjectHints.filter((h): h is string => !!h);
  const match = same.filter((e) => hints.some((h) => sameSubject(e.section, h)));
  return match.length === 1 ? [...others, match[0]!] : others;
}
