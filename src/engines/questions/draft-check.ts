import { figureMarkers } from "./rich-text";

/**
 * Checks a question extracted from an official exam (or generated in its style)
 * before a human reviews it. Nothing here decides correctness on its own: it
 * lists what a reviewer must look at, and the official answer key wins.
 */

export interface DraftOption {
  label: string;
  text: string;
}

export interface OfficialKeyEntry {
  number: number;
  /** Null when the key lists the question without a letter. */
  label: string | null;
  annulled: boolean;
}

export interface DraftInput {
  number: number | null;
  statement: string;
  options: DraftOption[];
  /** One entry per [[FIGURA n]] marker; `file` is the cropped image, when there is one. */
  figures: { file?: string | null }[];
  /** Label proposed by the model (generated drafts) or chosen by the reviewer. */
  proposedLabel?: string | null;
  /** Numbers from the extraction not found in the PDF text layer. */
  unmatchedNumbers?: string[];
}

export interface DraftCheck {
  options: DraftOption[];
  correctLabel: string | null;
  annulled: boolean;
  issues: string[];
}

const LABELS = ["A", "B", "C", "D", "E"];
const FIGURE_WORDS = /\b(figura|gr[aá]fico|imagem|ilustra[cç][aã]o|diagrama|esquema|tabela abaixo|mapa)\b/i;
const GARBLED = new RegExp(`[${String.fromCharCode(0xfffd)}${String.fromCharCode(0)}-${String.fromCharCode(8)}]|\\?{3,}`);

export function normalizeLabel(label: string) {
  return label.trim().replace(/[().\s]/g, "").toUpperCase().slice(0, 1);
}

/**
 * `reviewed` is true when a person saved the draft: warnings that only ask for
 * a look (figure crops, numbers to confirm) are dropped; hard problems stay.
 */
export function checkDraft(input: DraftInput, key: OfficialKeyEntry[] | null, { reviewed = false } = {}): DraftCheck {
  const issues: string[] = [];
  const options = input.options.map((o) => ({ label: normalizeLabel(o.label), text: o.text.trim() })).filter((o) => o.label || o.text);

  if (input.statement.trim().length < 15) issues.push("Enunciado vazio ou curto demais.");
  if (options.length < 2) issues.push("Menos de duas alternativas.");
  if (options.some((o) => !o.text)) issues.push("Há alternativa sem texto.");
  const labels = options.map((o) => o.label);
  if (new Set(labels).size !== labels.length) issues.push("Letras de alternativa repetidas.");
  if (labels.some((l) => !LABELS.includes(l))) issues.push("Letra de alternativa fora de A a E.");
  if (GARBLED.test(input.statement) || options.some((o) => GARBLED.test(o.text))) issues.push("Texto com caracteres corrompidos na leitura do PDF.");

  const markers = [input.statement, ...options.map((o) => o.text)].flatMap(figureMarkers);
  const highest = markers.length ? Math.max(...markers) : 0;
  if (highest > input.figures.length) issues.push(`O texto cita a figura ${highest}, mas só há ${input.figures.length} figura(s).`);
  else if (input.figures.length > new Set(markers).size) issues.push("Há figura sem marcador [[FIGURA n]] no texto.");
  const uncropped = input.figures.map((f, i) => (f.file ? null : i + 1)).filter((n): n is number => n !== null);
  if (uncropped.length) issues.push(`Figura ${uncropped.join(", ")} sem imagem recortada.`);
  else if (input.figures.length && !reviewed) issues.push("Confira o recorte das figuras: ele foi feito automaticamente.");
  if (!input.figures.length && FIGURE_WORDS.test(input.statement) && !reviewed) issues.push("O enunciado cita figura, gráfico ou tabela: confirme se a questão precisa de imagem.");
  if (input.unmatchedNumbers?.length && !reviewed) issues.push(`Confira no PDF estes números da transcrição: ${input.unmatchedNumbers.slice(0, 6).join(", ")}.`);

  let correctLabel: string | null = null;
  let annulled = false;
  const entry = key && input.number !== null ? key.find((k) => k.number === input.number) : undefined;
  if (entry?.annulled) {
    annulled = true;
    issues.push("Questão anulada no gabarito oficial.");
  } else if (entry?.label) {
    correctLabel = normalizeLabel(entry.label);
    if (!labels.includes(correctLabel)) issues.push(`O gabarito oficial indica ${correctLabel}, mas essa alternativa não foi extraída.`);
  } else {
    if (key && key.length > 0) issues.push(entry ? "Gabarito oficial sem letra para esta questão." : "Número da questão não encontrado no gabarito oficial.");
    if (input.proposedLabel) {
      correctLabel = normalizeLabel(input.proposedLabel);
      if (!labels.includes(correctLabel)) {
        issues.push(`Resposta indicada (${correctLabel}) não corresponde a nenhuma alternativa.`);
        correctLabel = null;
      }
    } else issues.push("Sem gabarito: informe a alternativa correta.");
  }

  return { options, correctLabel, annulled, issues };
}

/** Consecutive number ranges for batched extraction, e.g. 1–15, 16–30. */
export function extractionBatches(total: number, size: number, from = 1) {
  const batches: { from: number; to: number }[] = [];
  for (let start = from; start <= total; start += size) batches.push({ from: start, to: Math.min(total, start + size - 1) });
  return batches;
}

/** Share of distinctive words (4+ letters) two texts have in common, 0–1. Flags generated questions that copy a reference. */
export function wordOverlap(a: string, b: string) {
  const words = (s: string) => new Set(s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/\p{L}{4,}/gu) ?? []);
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}
