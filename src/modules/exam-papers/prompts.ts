import "server-only";

/*
 * Prompts and response schemas for reading official exams and writing
 * questions in their style. Schemas use the Gemini OpenAPI subset.
 */

export interface CatalogSubject {
  slug: string;
  name: string;
  topics: { code: string; path: string }[];
}

export function catalogText(subjects: CatalogSubject[]) {
  return subjects.map((s) => `- ${s.slug} (${s.name})\n${s.topics.map((t) => `  - ${t.code}: ${t.path}`).join("\n")}`).join("\n");
}

const STRING = { type: "STRING" };
const INTEGER = { type: "INTEGER" };
const BOOLEAN = { type: "BOOLEAN" };
const OPTIONS = { type: "ARRAY", items: { type: "OBJECT", properties: { label: STRING, text: STRING }, required: ["label", "text"] } };

export const EXTRACTION_SYSTEM = `Você transcreve provas oficiais de concursos brasileiros para um banco de questões.
Regras:
- Transcreva fielmente o texto impresso: não resuma, não corrija o conteúdo, não resolva e não invente nada. Corrija apenas falhas evidentes de digitalização (letras trocadas por ruído do scanner).
- Inclua no enunciado os textos-base, tabelas em texto e comandos que a questão usa. Se vários itens compartilham um texto-base, repita-o inteiro em cada um deles, mesmo que ele esteja em outra página do arquivo e mesmo que fique repetitivo: a questão será lida sozinha, e um enunciado como "de acordo com o texto I, pode-se inferir que" sem o texto não pode ser respondido. Transcreva o texto-base com título, subtítulo, parágrafos, destaques em maiúsculas e a linha de fonte, como estão impressos.
- Fórmulas, símbolos e unidades matemáticas em LaTeX entre $...$ (ou $$...$$ para destaque). Dinheiro fica como texto: R$ 150,00.
- Figuras, gráficos, diagramas, mapas e tabelas desenhadas: coloque [[FIGURA n]] na posição exata onde aparecem (n começa em 1 em cada questão) e descreva-as em figures, na mesma ordem, com page = posição da página no arquivo PDF (1 = primeira página do arquivo, não o número impresso) e box_2d = [ymin, xmin, ymax, xmax] de 0 a 1000 cobrindo só a figura. Se a alternativa é uma figura, use o marcador no texto da alternativa.
- Letras das alternativas sem parênteses: A, B, C, D, E.
- Provas de julgamento de itens (certo ou errado, como as do Cebraspe): o enunciado é o item a julgar, incluindo o texto ou a situação-problema a que ele se refere, e as alternativas são exatamente duas: C com o texto "Certo" e E com o texto "Errado".
- Classifique cada questão usando apenas os códigos do catálogo informado; se nenhum tópico servir, deixe topic vazio.
- difficulty é uma estimativa: EASY, MEDIUM ou HARD.`;

export function extractionPrompt(params: { from: number; to: number; first: boolean; catalog: string; hint: string }) {
  return [
    params.hint,
    params.first
      ? "Primeiro descreva a prova em paper: título impresso, número total de questões objetivas, e as partes por disciplina com a faixa de números (from/to)."
      : "",
    `Transcreva as questões de número ${params.from} a ${params.to} (inclusive). Ignore questões discursivas e redação. Se algum número desse intervalo não existir, não o invente.`,
    `Catálogo de disciplinas (slug) e tópicos (código):\n${params.catalog}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const PAPER = {
  type: "OBJECT",
  properties: {
    title: STRING,
    totalQuestions: INTEGER,
    sections: { type: "ARRAY", items: { type: "OBJECT", properties: { subject: STRING, from: INTEGER, to: INTEGER }, required: ["subject", "from", "to"] } },
  },
  required: ["title", "totalQuestions", "sections"],
};

/** The first batch must also describe the paper (sections decide which answer key block applies). */
export function extractionSchema(first: boolean) {
  return first ? { ...EXTRACTION_SCHEMA, required: ["paper", "questions"] } : EXTRACTION_SCHEMA;
}

const EXTRACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    paper: PAPER,
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          number: INTEGER,
          page: INTEGER,
          subject: STRING,
          topic: STRING,
          difficulty: { type: "STRING", enum: ["EASY", "MEDIUM", "HARD"] },
          statement: STRING,
          options: OPTIONS,
          figures: { type: "ARRAY", items: { type: "OBJECT", properties: { page: INTEGER, box_2d: { type: "ARRAY", items: INTEGER }, description: STRING }, required: ["page", "box_2d", "description"] } },
        },
        required: ["number", "page", "subject", "statement", "options", "figures"],
      },
    },
  },
  required: ["questions"],
};

export interface ExtractedQuestion {
  number: number;
  page: number;
  subject: string;
  topic?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  statement: string;
  options: { label: string; text: string }[];
  figures: { page: number; box_2d: number[]; description: string }[];
}

export interface ExtractionOutput {
  paper?: { title?: string; totalQuestions?: number; sections?: { subject: string; from: number; to: number }[] };
  questions: ExtractedQuestion[];
}

export const ANSWER_KEY_PROMPT = `Este PDF é o gabarito oficial de um concurso. Transcreva todas as tabelas de respostas das provas objetivas.
- Um bloco por combinação de versão da prova (cor, tipo ou código; vazio se só existe uma) e disciplina ou parte (como impresso).
- Para cada questão: number e label com a letra final. Se o gabarito diz "Alterada de E para D", label = "D".
- Questão anulada: annulled = true e label vazio.
- Alguns gabaritos não escrevem a letra: imprimem as cinco alternativas e preenchem de preto o círculo da correta. Nesses, a resposta é a letra do círculo preenchido (o único escuro da linha), não a primeira da linha. Confira linha a linha.
- Não deduza respostas que não estão impressas.`;

export const ANSWER_KEY_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["DEFINITIVO", "PRELIMINAR", "DESCONHECIDO"] },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          version: STRING,
          section: STRING,
          answers: { type: "ARRAY", items: { type: "OBJECT", properties: { number: INTEGER, label: STRING, annulled: BOOLEAN }, required: ["number", "label", "annulled"] } },
        },
        required: ["version", "section", "answers"],
      },
    },
  },
  required: ["kind", "sections"],
};

export const CLASSIFY_SYSTEM = `Você classifica questões de concurso dentro do catálogo de disciplinas e tópicos de um concurso específico.
Use apenas os códigos informados. Escolha pelo conteúdo cobrado na questão, não pelo assunto do texto de apoio: uma questão de interpretação sobre um texto de biologia é de Língua Portuguesa.
Quando nenhum tópico servir, devolva topic vazio.`;

export function classifyPrompt(params: { catalog: string; items: { number: number; statement: string }[] }) {
  return `Catálogo de disciplinas (slug) e tópicos (código):
${params.catalog}

Para cada questão devolva number (o mesmo recebido) e topic (o código do tópico mais específico que couber).

${params.items.map((q) => `### Questão ${q.number}\n${q.statement.slice(0, 1200)}`).join("\n\n")}`;
}

export const CLASSIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: { type: "ARRAY", items: { type: "OBJECT", properties: { number: INTEGER, topic: STRING }, required: ["number", "topic"] } },
  },
  required: ["questions"],
};

export interface ClassifyOutput {
  questions: { number: number; topic: string }[];
}

export const BASE_TEXT_SYSTEM = `Você recupera textos-base de provas oficiais brasileiras que ficaram de fora da transcrição.
Transcreva fielmente o que está impresso: não resuma, não traduza, não corrija e não invente. Mantenha título, subtítulo, parágrafos, destaques em maiúsculas e a linha de fonte (autor, obra, endereço e data de acesso).
Fórmulas e símbolos matemáticos em LaTeX entre $...$. Se a questão não depende de nenhum texto-base impresso, devolve baseText vazio.`;

export function baseTextPrompt(items: { number: number; statement: string }[]) {
  return `Cada questão abaixo foi transcrita deste PDF sem o texto-base a que ela se refere (texto I, texto CB1A1, a tirinha, o parágrafo citado, o poema, o excerto). Localize na prova o texto-base de cada uma e transcreva-o inteiro.
Devolva number (o mesmo número recebido) e baseText (só o texto-base, sem o comando da questão nem as alternativas).

${items.map((q) => `### Questão ${q.number}\n${q.statement}`).join("\n\n")}`;
}

export const BASE_TEXT_SCHEMA = {
  type: "OBJECT",
  properties: {
    texts: { type: "ARRAY", items: { type: "OBJECT", properties: { number: INTEGER, baseText: STRING }, required: ["number", "baseText"] } },
  },
  required: ["texts"],
};

export interface BaseTextOutput {
  texts: { number: number; baseText: string }[];
}

export const SOLVE_SYSTEM = `Você é professor de cursinho preparatório para concursos militares. Resolve questões objetivas com rigor, em português do Brasil, passo a passo e sem pular contas.
Use LaTeX entre $...$ para fórmulas. Não cite fontes externas.`;

export function solvePrompt(items: { ref: string; statement: string; options: string; officialLabel: string | null }[]) {
  return `Resolva cada questão abaixo de forma independente. Para cada uma devolva:
- ref (igual ao recebido);
- answer: a letra que a sua resolução encontra (sem olhar o gabarito);
- explanation: resolução comentada e objetiva (até 12 linhas), terminando com a alternativa correta;
- confidence: HIGH, MEDIUM ou LOW.
Quando a questão depende de figura que você não consegue ver com clareza, diga isso na explicação e use confidence LOW.

${items.map((q) => `### ${q.ref}\n${q.statement}\n${q.options}`).join("\n\n")}`;
}

/** Second pass when the independent solution disagrees with the official key. */
export function explainWithKeyPrompt(items: { ref: string; statement: string; options: string; officialLabel: string | null }[]) {
  return `O gabarito oficial de cada questão abaixo está indicado. Escreva a resolução comentada que chega à alternativa oficial, passo a passo e sem pular contas.
Se, depois de conferir com cuidado, você concluir que a alternativa oficial não pode estar correta com o enunciado dado, não force a conta: explique o conflito em explanation e use confidence LOW.
Devolva ref, answer (a alternativa que a sua resolução sustenta), explanation e confidence.

${items.map((q) => `### ${q.ref} (gabarito oficial: ${q.officialLabel})\n${q.statement}\n${q.options}`).join("\n\n")}`;
}

export const SOLVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    solutions: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { ref: STRING, answer: STRING, explanation: STRING, confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] } }, required: ["ref", "answer", "explanation", "confidence"] },
    },
  },
  required: ["solutions"],
};

export interface SolveOutput {
  solutions: { ref: string; answer: string; explanation: string; confidence: "HIGH" | "MEDIUM" | "LOW" }[];
}

export const GENERATION_SYSTEM = `Você elabora questões inéditas para treino, no estilo de uma prova oficial específica. Nunca copie nem parafraseie de perto as questões de referência: use-as só para calibrar formato, tamanho, contexto, nível e tipo de raciocínio.
Regras:
- Português do Brasil, enunciado autocontido, sem figuras (não use [[FIGURA n]]).
- Cinco alternativas A–E, uma única correta, distratores plausíveis que correspondam a erros comuns.
- Números que levem a contas exatas; confira a resposta antes de responder.
- Fórmulas em LaTeX entre $...$.
- Explicação passo a passo, terminando com a alternativa correta.
- Use apenas os códigos de tópico informados.`;

export function generationPrompt(params: { competition: string; subject: string; topics: string; count: number; examples: string; avoid: string }) {
  return `Crie ${params.count} questões inéditas de ${params.subject} no estilo da prova ${params.competition}.

Tópicos permitidos (código: nome):
${params.topics}

Questões oficiais de referência (não copie):
${params.examples}
${params.avoid ? `\nNão repita estes enunciados já gerados:\n${params.avoid}` : ""}`;
}

export const GENERATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          topic: STRING,
          difficulty: { type: "STRING", enum: ["EASY", "MEDIUM", "HARD"] },
          statement: STRING,
          options: OPTIONS,
          answer: STRING,
          explanation: STRING,
          styleNote: STRING,
        },
        required: ["topic", "difficulty", "statement", "options", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

export interface GenerationOutput {
  questions: { topic: string; difficulty: "EASY" | "MEDIUM" | "HARD"; statement: string; options: { label: string; text: string }[]; answer: string; explanation: string; styleNote?: string }[];
}
