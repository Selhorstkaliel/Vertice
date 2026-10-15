/**
 * Document type from its title, file name and first lines (pure). Rules
 * first; only a document the rules cannot decide goes to the AI. Order
 * matters: "Retificação do Edital" is a retificação, not an edital;
 * "Edital de convocação" is a convocação.
 */

export type DocType = "EDITAL" | "RETIFICACAO" | "CONVOCACAO" | "RESULTADO" | "OUTRO";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/%20/g, " ")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");

const RULES: { type: DocType; re: RegExp }[] = [
  // A consolidated edital ("abertura, atualizado conforme retificações") is still the edital.
  { type: "EDITAL", re: /\babertura\b.*\b(atualizad[oa]|consolidad[oa])\b/ },
  // "Resultado final (retificado em …)" is a result that was corrected, not a retificação of the edital.
  { type: "RESULTADO", re: /^(resultado|gabarito|homologacao|classificacao|relacao (final|dos candidatos))/ },
  { type: "RETIFICACAO", re: /\bretifica(cao|coes|do|da)?\b|\berrata\b|\balteracao do edital\b/ },
  { type: "RESULTADO", re: /\bresultado|\bclassifica(cao|dos)\b|\bhomologa(cao)?\b|\bgabarito|\baprovados\b|\brelacao (final|dos candidatos)/ },
  { type: "CONVOCACAO", re: /\bconvoca(cao|dos|toria)?\b|\blocais?\b.*\bprovas?\b|\bcartao de (confirmacao|identificacao)\b/ },
  {
    type: "EDITAL",
    re: /\bedital\b.*\b(abertura|normativo|do concurso|completo)\b|\binstrucoes especificas\b|^ie\b|\bie [a-z]+ ?\d{4}\b|\bedital (n|no|numero)? ?\d+ ?\d* (de )?abertura\b|\bedital do concurso\b|\bedital \d{4}\b/,
  },
];

export function classifyDocument(input: { title: string; url?: string; firstText?: string }): { type: DocType; confident: boolean; reason: string } {
  let fileName = "";
  try {
    fileName = input.url ? decodeURIComponent(input.url.split(/[?#]/)[0]!.split("/").pop() ?? "") : "";
  } catch {
    fileName = input.url?.split("/").pop() ?? "";
  }
  const candidates = [input.title, fileName, (input.firstText ?? "").slice(0, 600)].map(norm).map((t) => t.trim());
  for (const [i, text] of candidates.entries()) {
    if (!text) continue;
    for (const rule of RULES) {
      if (rule.re.test(text)) return { type: rule.type, confident: i < 2 || rule.type !== "EDITAL", reason: ["título", "nome do arquivo", "início do texto"][i]! };
    }
  }
  // A bare "Edital nº 7" can be anything (many bancas number every act as an edital).
  const bareEdital = candidates.some((t) => /\bedital\b/.test(t));
  return { type: "OUTRO", confident: !bareEdital, reason: bareEdital ? "edital sem indicação de abertura" : "sem palavra-chave" };
}

/** Only these get the full AI reading; the rest are listed and announced with their link. */
export const READ_TYPES: DocType[] = ["EDITAL", "RETIFICACAO"];
