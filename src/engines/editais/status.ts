/**
 * Competition status from reviewed dates (pure), and matching of syllabus
 * items to catalog topics.
 */

export type CompetitionStatus = "EXPECTED" | "EDITAL_PUBLISHED" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "EXAM_DONE" | "CONCLUDED";

export function statusFromDates(d: { inscricaoInicio: string | null; inscricaoFim: string | null; prova: string | null; resultadoFinal: string | null }, today: string): CompetitionStatus {
  if (d.resultadoFinal && today > d.resultadoFinal) return "CONCLUDED";
  if (d.prova && today > d.prova) return "EXAM_DONE";
  if (d.inscricaoFim && today > d.inscricaoFim) return "REGISTRATION_CLOSED";
  if (d.inscricaoInicio && today >= d.inscricaoInicio) return "REGISTRATION_OPEN";
  return "EDITAL_PUBLISHED";
}

export const STATUS_PT: Record<CompetitionStatus, string> = {
  EXPECTED: "Previsto",
  EDITAL_PUBLISHED: "Edital publicado",
  REGISTRATION_OPEN: "Inscrições abertas",
  REGISTRATION_CLOSED: "Inscrições encerradas",
  EXAM_DONE: "Prova realizada",
  CONCLUDED: "Concluído",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(de|da|do|das|dos|e|a|o|as|os|em|no|na|nos|nas|com|para|por)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Word overlap (Dice) between two normalized names. */
export function similarity(a: string, b: string) {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return (2 * common) / (wa.size + wb.size);
}

/** Best catalog topic for a syllabus item; null below the threshold (becomes a new topic for review). */
export function matchTopic(item: string, topics: { id: string; name: string }[], threshold = 0.6) {
  let best: { id: string; name: string; score: number } | null = null;
  for (const t of topics) {
    const exact = norm(t.name) === norm(item);
    const score = exact ? 1 : similarity(item, t.name);
    if (!best || score > best.score) best = { ...t, score };
  }
  return best && best.score >= threshold ? best : null;
}

/** Subject of the competition named in the edital ("Língua Portuguesa" → Português). */
export function matchSubject(name: string, subjects: { id: string; name: string; slug: string }[]) {
  const n = norm(name);
  const aliases: Record<string, string[]> = {
    portugues: ["lingua portuguesa", "portugues"],
    ingles: ["lingua inglesa", "ingles"],
    matematica: ["matematica"],
    fisica: ["fisica"],
    quimica: ["quimica"],
    historia: ["historia"],
    geografia: ["geografia"],
    redacao: ["redacao"],
  };
  for (const s of subjects) {
    if (norm(s.name) === n) return s;
    if ((aliases[s.slug] ?? []).some((a) => n.includes(a))) return s;
  }
  let best: { s: (typeof subjects)[number]; score: number } | null = null;
  for (const s of subjects) {
    const score = similarity(name, s.name);
    if (!best || score > best.score) best = { s, score };
  }
  return best && best.score >= 0.6 ? best.s : null;
}
