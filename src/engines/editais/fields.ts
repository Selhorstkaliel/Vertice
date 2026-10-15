import { z } from "zod";

/**
 * What is read from an edital, group by group. Every item carries the page and
 * the literal passage that supports it, so a reviewer can check it against the
 * PDF and the automatic checks can look the values up in the text.
 */

const evidence = { pagina: z.number().int().min(1).max(2000), trecho: z.string().max(600) };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");

export const DATE_KEYS = [
  "inscricao_inicio",
  "inscricao_fim",
  "isencao_inicio",
  "isencao_fim",
  "pagamento_fim",
  "prova_objetiva",
  "prova_discursiva",
  "redacao",
  "resultado_preliminar",
  "recurso_inicio",
  "recurso_fim",
  "resultado_final",
  "outra",
] as const;
export type DateKey = (typeof DATE_KEYS)[number];

export const DATE_LABEL: Record<DateKey, string> = {
  inscricao_inicio: "Início das inscrições",
  inscricao_fim: "Fim das inscrições",
  isencao_inicio: "Início do pedido de isenção",
  isencao_fim: "Fim do pedido de isenção",
  pagamento_fim: "Último dia de pagamento",
  prova_objetiva: "Prova objetiva",
  prova_discursiva: "Prova discursiva",
  redacao: "Redação",
  resultado_preliminar: "Resultado preliminar",
  recurso_inicio: "Início do prazo de recurso",
  recurso_fim: "Fim do prazo de recurso",
  resultado_final: "Resultado final",
  outra: "Outra data",
};

export const groupSchemas = {
  geral: z.object({
    banca: z.object({ nome: z.string().max(200), ...evidence }).nullable(),
    cargos: z.array(z.object({ nome: z.string().max(200), vagas: z.number().int().min(0).max(100000).nullable(), ...evidence })).max(60),
  }),
  datas: z.object({
    datas: z.array(z.object({ chave: z.enum(DATE_KEYS), rotulo: z.string().max(200), data: isoDate, ...evidence })).max(60),
  }),
  etapas: z.object({
    etapas: z.array(z.object({ nome: z.string().max(200), ordem: z.number().int().min(1).max(30), eliminatoria: z.boolean(), descricao: z.string().max(600), ...evidence })).max(30),
  }),
  provas: z.object({
    disciplinas: z.array(
      z.object({ nome: z.string().max(200), questoes: z.number().int().min(0).max(500).nullable(), peso: z.number().min(0).max(100).nullable(), notaMinima: z.number().min(0).max(10000).nullable(), ...evidence }),
    ).max(40),
    pontuacao: z
      .object({ modo: z.enum(["ACERTOS", "DESCONTO"]), descontoPorErro: z.number().min(0).max(10).nullable(), notaMinimaTotal: z.number().min(0).max(100000).nullable(), notaMaxima: z.number().min(0).max(100000).nullable(), ...evidence })
      .nullable(),
  }),
  conteudo: z.object({
    conteudo: z.array(z.object({ disciplina: z.string().max(200), itens: z.array(z.string().max(300)).max(300), ...evidence })).max(40),
  }),
  redacao: z.object({
    redacao: z
      .object({
        tipoTexto: z.string().max(300),
        linhasMin: z.number().int().min(0).max(200).nullable(),
        linhasMax: z.number().int().min(0).max(200).nullable(),
        criterios: z.array(z.object({ nome: z.string().max(200), descricao: z.string().max(800), notaMaxima: z.number().min(0).max(1000), peso: z.number().min(0).max(100).nullable() })).max(15),
        zera: z.array(z.string().max(300)).max(20),
        ...evidence,
      })
      .nullable(),
  }),
  taf: z.object({
    taf: z
      .array(z.object({ prova: z.string().max(200), sexo: z.enum(["MASCULINO", "FEMININO", "AMBOS"]), faixaEtaria: z.string().max(80).nullable(), indice: z.string().max(80), unidade: z.string().max(40), ...evidence }))
      .max(80),
  }),
  documentos: z.object({
    documentos: z.array(z.object({ nome: z.string().max(300), tipo: z.enum(["DOCUMENTO", "EXAME_SAUDE"]), etapa: z.string().max(200), prazo: isoDate.nullable(), ...evidence })).max(120),
  }),
} as const;

export type GroupKey = keyof typeof groupSchemas;
export const GROUP_KEYS = Object.keys(groupSchemas) as GroupKey[];
export type GroupOutput<K extends GroupKey> = z.infer<(typeof groupSchemas)[K]>;

export const GROUP_LABEL: Record<GroupKey, string> = {
  geral: "Banca, cargos e vagas",
  datas: "Datas",
  etapas: "Etapas",
  provas: "Disciplinas e pontuação",
  conteudo: "Conteúdo programático",
  redacao: "Critérios de redação",
  taf: "Índices do teste físico",
  documentos: "Documentos e exames de saúde",
};

/** One reviewable field of an extraction. */
export interface ExtractedField {
  group: GroupKey;
  label: string;
  value: unknown;
  page: number | null;
  quote: string | null;
  issues: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  edited: boolean;
}

export type ExtractedFields = Record<string, ExtractedField>;

const pageOf = (items: { pagina: number }[]) => (items.length ? Math.min(...items.map((i) => i.pagina)) : null);
const quoteOf = (items: { trecho: string }[]) => items.map((i) => i.trecho).filter(Boolean)[0] ?? null;

/** Splits group outputs into reviewable fields: each date and each subject's syllabus on its own, lists as one. */
export function toFields(groups: Partial<{ [K in GroupKey]: GroupOutput<K> }>): ExtractedFields {
  const out: ExtractedFields = {};
  const add = (key: string, group: GroupKey, label: string, value: unknown, page: number | null, quote: string | null) => {
    out[key] = { group, label, value, page, quote, issues: [], status: "PENDING", edited: false };
  };
  const g = groups;
  if (g.geral) {
    if (g.geral.banca) add("banca", "geral", "Banca organizadora", g.geral.banca.nome, g.geral.banca.pagina, g.geral.banca.trecho);
    if (g.geral.cargos.length) add("cargos", "geral", "Cargos e vagas", g.geral.cargos.map(({ nome, vagas }) => ({ nome, vagas })), pageOf(g.geral.cargos), quoteOf(g.geral.cargos));
  }
  for (const d of g.datas?.datas ?? []) {
    let key = `data:${d.chave}`;
    for (let n = 2; out[key]; n++) key = `data:${d.chave}:${n}`;
    add(key, "datas", d.chave === "outra" ? d.rotulo : DATE_LABEL[d.chave], d.data, d.pagina, d.trecho);
  }
  if (g.etapas?.etapas.length) add("etapas", "etapas", "Etapas", g.etapas.etapas.map(({ nome, ordem, eliminatoria, descricao }) => ({ nome, ordem, eliminatoria, descricao })), pageOf(g.etapas.etapas), quoteOf(g.etapas.etapas));
  if (g.provas?.disciplinas.length) {
    add("disciplinas", "provas", "Disciplinas, questões, pesos e mínimos", g.provas.disciplinas.map(({ nome, questoes, peso, notaMinima }) => ({ nome, questoes, peso, notaMinima })), pageOf(g.provas.disciplinas), quoteOf(g.provas.disciplinas));
  }
  if (g.provas?.pontuacao) {
    const { pagina, trecho, ...value } = g.provas.pontuacao;
    add("pontuacao", "provas", "Regra de pontuação", value, pagina, trecho);
  }
  for (const c of g.conteudo?.conteudo ?? []) add(`conteudo:${c.disciplina.trim().toLowerCase()}`, "conteudo", `Conteúdo programático: ${c.disciplina}`, c.itens, c.pagina, c.trecho);
  if (g.redacao?.redacao) {
    const { pagina, trecho, ...value } = g.redacao.redacao;
    add("redacao", "redacao", "Critérios de redação", value, pagina, trecho);
  }
  if (g.taf?.taf.length) add("taf", "taf", "Índices do teste físico", g.taf.taf.map(({ prova, sexo, faixaEtaria, indice, unidade }) => ({ prova, sexo, faixaEtaria, indice, unidade })), pageOf(g.taf.taf), quoteOf(g.taf.taf));
  if (g.documentos?.documentos.length) {
    add("documentos", "documentos", "Documentos e exames da inspeção de saúde", g.documentos.documentos.map(({ nome, tipo, etapa, prazo }) => ({ nome, tipo, etapa, prazo })), pageOf(g.documentos.documentos), quoteOf(g.documentos.documentos));
  }
  return out;
}
