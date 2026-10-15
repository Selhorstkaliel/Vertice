import type { ExtractedFields } from "./fields";

/**
 * Automatic checks on what the AI read (pure). Nothing here proves a value is
 * right; each failure becomes an issue the reviewer must look at.
 */

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const normText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Ways an ISO date can be printed in a Brazilian document. */
export function dateVariants(iso: string): string[] {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return [];
  const dd = d.padStart(2, "0");
  const di = String(Number(d));
  const mm = m.padStart(2, "0");
  const month = MONTHS[Number(m) - 1]!;
  return [`${dd}/${mm}/${y}`, `${di}/${mm}/${y}`, `${dd}/${mm}/${y.slice(2)}`, `${dd}.${mm}.${y}`, `${di} de ${month} de ${y}`, `${dd} de ${month} de ${y}`, `${dd}/${mm}`, `${di}/${mm}`, `${di} de ${month}`, `${dd} de ${month}`, `${y}-${mm}-${dd}`];
}

export function dateInText(iso: string, text: string) {
  const t = normText(text).replace(/º/g, "");
  return dateVariants(iso).some((v) => t.includes(v));
}

/** A number counts as printed when it appears as a standalone figure (1.234 or 1234). */
export function numberInText(n: number, text: string) {
  const plain = String(n);
  const dotted = n >= 1000 ? n.toLocaleString("pt-BR") : plain;
  const comma = String(n).replace(".", ",");
  return [plain, dotted, comma].some((v) => new RegExp(`(^|[^\\d.,])${v.replace(/[.]/g, "\\.")}($|[^\\d])`).test(text));
}

const ORDER: [string, string, string][] = [
  ["data:inscricao_inicio", "data:inscricao_fim", "O fim das inscrições vem antes do início."],
  ["data:isencao_inicio", "data:isencao_fim", "O fim do pedido de isenção vem antes do início."],
  ["data:recurso_inicio", "data:recurso_fim", "O fim do prazo de recurso vem antes do início."],
  ["data:inscricao_inicio", "data:prova_objetiva", "A prova está antes do início das inscrições."],
  ["data:inscricao_fim", "data:prova_objetiva", "A prova está antes do fim das inscrições."],
  ["data:prova_objetiva", "data:resultado_final", "O resultado final está antes da prova."],
];

/** Fills `issues` on each field and returns general issues. Mutates and returns the same object. */
export function checkExtraction(
  fields: ExtractedFields,
  ctx: { pageTexts: string[]; documentDate: string | null; type: "EDITAL" | "RETIFICACAO" },
): { fields: ExtractedFields; issues: string[] } {
  const general: string[] = [];
  const all = ctx.pageTexts.join("\n");
  // Scanned PDFs have (almost) no text layer; then nothing can be checked against the text.
  const hasText = all.replace(/\s/g, "").length > 80;
  const pageText = (p: number | null) => (p && ctx.pageTexts[p - 1] ? ctx.pageTexts[p - 1]! : "");

  for (const [key, f] of Object.entries(fields)) {
    f.issues = [];
    if (f.page !== null && (f.page < 1 || f.page > ctx.pageTexts.length)) f.issues.push(`Página ${f.page} não existe no PDF (${ctx.pageTexts.length} páginas).`);
    if (f.quote && hasText) {
      const q = normText(f.quote).replace(/[^a-z0-9 ]/g, "").slice(0, 60).trim();
      if (q.length > 12 && !normText(all).replace(/[^a-z0-9 ]/g, "").includes(q)) f.issues.push("O trecho citado não foi encontrado no texto do PDF.");
    }
    if (key.startsWith("data:") && typeof f.value === "string") {
      if (hasText && !dateInText(f.value, all)) f.issues.push("Esta data não aparece escrita no PDF.");
      else if (hasText && f.page && pageText(f.page) && !dateInText(f.value, pageText(f.page))) f.issues.push(`A data não aparece na página ${f.page} citada.`);
      if (ctx.documentDate && f.value < ctx.documentDate) f.issues.push("A data já tinha passado na data do documento.");
    }
    if (key === "disciplinas" && Array.isArray(f.value) && hasText) {
      for (const d of f.value as { nome: string; questoes: number | null; peso: number | null }[]) {
        if (d.questoes !== null && !numberInText(d.questoes, all)) f.issues.push(`${d.nome}: o número de questões (${d.questoes}) não aparece no PDF.`);
        if (d.peso !== null && !numberInText(d.peso, all)) f.issues.push(`${d.nome}: o peso (${d.peso}) não aparece no PDF.`);
      }
    }
    if (key === "cargos" && Array.isArray(f.value) && hasText) {
      for (const c of f.value as { nome: string; vagas: number | null }[]) if (c.vagas !== null && !numberInText(c.vagas, all)) f.issues.push(`${c.nome}: o número de vagas (${c.vagas}) não aparece no PDF.`);
    }
  }

  for (const [a, b, message] of ORDER) {
    const va = fields[a]?.value;
    const vb = fields[b]?.value;
    if (typeof va === "string" && typeof vb === "string" && vb < va) {
      fields[b]!.issues.push(message);
      general.push(message);
    }
  }

  const disciplinas = fields["disciplinas"]?.value as { questoes: number | null }[] | undefined;
  const totalQuestions = all.match(/total(?: de)? (\d{2,3}) quest/i)?.[1];
  if (disciplinas?.length && totalQuestions && disciplinas.every((d) => d.questoes !== null)) {
    const sum = disciplinas.reduce((acc, d) => acc + (d.questoes ?? 0), 0);
    if (sum !== Number(totalQuestions)) {
      const msg = `A soma das questões por disciplina (${sum}) não fecha com o total impresso (${totalQuestions}).`;
      fields["disciplinas"]!.issues.push(msg);
      general.push(msg);
    }
  }
  const redacao = fields["redacao"]?.value as { criterios: { notaMaxima: number }[] } | undefined;
  if (redacao && redacao.criterios.length === 0) fields["redacao"]!.issues.push("Critérios de redação sem nenhum critério.");

  if (ctx.type === "EDITAL") {
    if (!fields["data:prova_objetiva"] && !Object.keys(fields).some((k) => k.startsWith("data:prova"))) general.push("Edital sem data de prova: confira se o documento traz o cronograma.");
    if (!fields["data:inscricao_inicio"] && !fields["data:inscricao_fim"]) general.push("Edital sem período de inscrição.");
    if (!fields["disciplinas"]) general.push("Edital sem disciplinas da prova.");
  }
  if (!hasText) general.push("O PDF não tem camada de texto (provavelmente escaneado): nenhum valor pôde ser conferido automaticamente.");
  return { fields, issues: general };
}

/**
 * Pages worth sending for each group, by keywords in the page text. Long
 * editais then cost a fraction of the full document. Empty = send everything.
 */
const GROUP_WORDS: Record<string, RegExp> = {
  geral: /\b(banca|organizad|cargo|vagas?)\b/,
  datas: /\b(cronograma|inscric|isencao|pagamento|data|recurso|resultado)\b/,
  etapas: /\b(etapa|fase|eliminatori|classificatori|inspecao|exame|avaliacao)\b/,
  provas: /\b(disciplina|questoes|peso|pontuac|nota minima|pontos|prova objetiva)\b/,
  conteudo: /\b(conteudo programatico|conteudos programaticos|programa|objetos de avaliacao|assuntos)\b/,
  redacao: /\b(redacao|texto dissertativo|linhas|zero|criterios de correcao)\b/,
  taf: /\b(teste de aptidao fisica|taf|tacf|condicionamento fisico|flexao|barra|corrida|abdominal|natacao)\b/,
  documentos: /\b(documento|certidao|exame|laudo|inspecao de saude|apresentar|atestado)\b/,
};

export function relevantPages(pageTexts: string[], group: string, max = 24): number[] {
  const re = GROUP_WORDS[group];
  if (!re) return [];
  const scored = pageTexts
    .map((t, i) => ({ page: i + 1, hits: (normText(t).match(new RegExp(re.source, "g")) ?? []).length }))
    .filter((p) => p.hits > 0);
  if (scored.length === 0) return [];
  // Keep neighbours too: a table often continues on the next page.
  const pages = new Set<number>();
  for (const p of scored.sort((a, b) => b.hits - a.hits).slice(0, max)) {
    pages.add(p.page);
    if (p.page < pageTexts.length) pages.add(p.page + 1);
  }
  return [...pages].sort((a, b) => a - b).slice(0, max);
}
