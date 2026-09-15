/**
 * Reference catalog.
 *
 * Subjects/topics are a general curriculum taxonomy — content, not claims
 * about any specific edital. Competition ↔ subject links reflect subjects
 * commonly present in these exams and are ALL seeded as UNVERIFIED, without
 * weights, dates, exam boards or incidence. The UI labels them
 * "Informação não verificada" until a user confirms against the official edital.
 */

export type TopicSeed = string | [name: string, children: string[]];

export interface SubjectSeed {
  slug: string;
  name: string;
  area: string;
  topics: TopicSeed[];
}

export const EXAM_BOARDS = [
  { slug: "cebraspe", name: "CEBRASPE", fullName: "Centro Brasileiro de Pesquisa em Avaliação e Seleção e de Promoção de Eventos" },
  { slug: "fgv", name: "FGV", fullName: "Fundação Getulio Vargas" },
  { slug: "fcc", name: "FCC", fullName: "Fundação Carlos Chagas" },
  { slug: "vunesp", name: "VUNESP", fullName: "Fundação para o Vestibular da Universidade Estadual Paulista" },
  { slug: "cesgranrio", name: "CESGRANRIO", fullName: "Fundação Cesgranrio" },
  { slug: "aocp", name: "AOCP", fullName: "Instituto AOCP" },
  { slug: "ibfc", name: "IBFC", fullName: "Instituto Brasileiro de Formação e Capacitação" },
  { slug: "idecan", name: "IDECAN", fullName: "Instituto de Desenvolvimento Educacional, Cultural e Assistencial Nacional" },
  { slug: "militar", name: "Concursos militares", fullName: "Bancas próprias das Forças Armadas e escolas militares" },
];

export const SUBJECTS: SubjectSeed[] = [
  {
    slug: "matematica",
    name: "Matemática",
    area: "Exatas",
    topics: [
      ["Conjuntos e números", ["Conjuntos numéricos", "Razão e proporção", "Porcentagem"]],
      ["Funções", ["Função afim", "Função quadrática", "Função exponencial", "Função logarítmica", "Função modular"]],
      ["Trigonometria", ["Triângulo retângulo", "Ciclo trigonométrico", "Equações trigonométricas", "Lei dos senos e dos cossenos"]],
      ["Sequências", ["Progressão aritmética", "Progressão geométrica"]],
      ["Matrizes e sistemas", ["Matrizes", "Determinantes", "Sistemas lineares"]],
      ["Análise combinatória e probabilidade", ["Princípio fundamental da contagem", "Arranjos, permutações e combinações", "Probabilidade", "Binômio de Newton"]],
      ["Geometria plana", ["Triângulos", "Quadriláteros e polígonos", "Circunferência e círculo", "Áreas de figuras planas"]],
      ["Geometria espacial", ["Prismas e pirâmides", "Cilindros, cones e esferas"]],
      ["Geometria analítica", ["Ponto e reta", "Circunferência no plano cartesiano", "Cônicas"]],
      "Números complexos",
      "Polinômios e equações algébricas",
    ],
  },
  {
    slug: "fisica",
    name: "Física",
    area: "Exatas",
    topics: [
      ["Cinemática", ["Vetores", "Movimento uniforme", "Movimento uniformemente variado", "Lançamentos", "Movimento circular"]],
      ["Dinâmica", ["Leis de Newton", "Atrito", "Plano inclinado", "Dinâmica do movimento circular"]],
      ["Trabalho e energia", ["Trabalho e potência", "Energia mecânica e conservação"]],
      ["Impulso e quantidade de movimento", ["Impulso", "Colisões"]],
      "Gravitação universal",
      ["Estática", ["Equilíbrio do ponto material", "Equilíbrio do corpo extenso"]],
      ["Hidrostática", ["Pressão e teorema de Stevin", "Empuxo"]],
      ["Termologia", ["Termometria", "Dilatação térmica", "Calorimetria", "Estudo dos gases", "Termodinâmica"]],
      ["Óptica", ["Reflexão e espelhos", "Refração e lentes"]],
      ["Ondulatória", ["Movimento harmônico simples", "Ondas", "Acústica"]],
      ["Eletrostática", ["Carga e força elétrica", "Campo e potencial elétrico"]],
      ["Eletrodinâmica", ["Corrente elétrica e resistores", "Circuitos elétricos", "Capacitores"]],
      ["Eletromagnetismo", ["Campo magnético", "Força magnética", "Indução eletromagnética"]],
    ],
  },
  {
    slug: "quimica",
    name: "Química",
    area: "Exatas",
    topics: [
      "Estrutura atômica",
      "Tabela periódica",
      "Ligações químicas",
      "Funções inorgânicas",
      "Estequiometria",
      "Soluções",
      "Termoquímica",
      "Cinética química",
      "Equilíbrio químico",
      "Eletroquímica",
      ["Química orgânica", ["Funções orgânicas", "Isomeria", "Reações orgânicas"]],
    ],
  },
  {
    slug: "portugues",
    name: "Língua Portuguesa",
    area: "Linguagens",
    topics: [
      ["Interpretação de texto", ["Compreensão e interpretação", "Tipologia e gêneros textuais"]],
      ["Ortografia e acentuação", ["Ortografia oficial", "Acentuação gráfica"]],
      ["Morfologia", ["Classes de palavras", "Formação de palavras"]],
      ["Sintaxe", ["Termos da oração", "Período composto", "Concordância verbal e nominal", "Regência verbal e nominal", "Crase", "Colocação pronominal"]],
      "Pontuação",
      ["Semântica", ["Sinonímia, antonímia e polissemia", "Figuras de linguagem"]],
      "Coesão e coerência",
    ],
  },
  {
    slug: "ingles",
    name: "Língua Inglesa",
    area: "Linguagens",
    topics: [
      "Reading comprehension",
      "Vocabulary",
      "Verb tenses",
      "Modal verbs",
      "Conditionals",
      "Pronouns and determiners",
      "Prepositions and phrasal verbs",
      "Passive voice",
      "Reported speech",
    ],
  },
  {
    slug: "redacao",
    name: "Redação",
    area: "Linguagens",
    topics: ["Estrutura do texto dissertativo-argumentativo", "Adequação ao tema e ao gênero", "Argumentação e repertório", "Coesão textual na redação"],
  },
  {
    slug: "raciocinio-logico",
    name: "Raciocínio Lógico",
    area: "Exatas",
    topics: [
      ["Lógica proposicional", ["Proposições e conectivos", "Tabela-verdade", "Equivalências lógicas", "Negação de proposições"]],
      "Argumentação lógica",
      "Diagramas lógicos",
      "Lógica de primeira ordem",
      "Sequências lógicas",
      "Problemas de contagem",
    ],
  },
  {
    slug: "informatica",
    name: "Informática",
    area: "Tecnologia",
    topics: [
      "Sistemas operacionais",
      "Editores de texto e planilhas",
      "Redes e internet",
      "Segurança da informação",
      "Computação em nuvem",
      "Noções de banco de dados",
    ],
  },
  {
    slug: "direito-constitucional",
    name: "Direito Constitucional",
    area: "Direito",
    topics: [
      "Princípios fundamentais",
      ["Direitos e garantias fundamentais", ["Direitos individuais e coletivos", "Remédios constitucionais", "Direitos sociais", "Nacionalidade", "Direitos políticos"]],
      "Organização do Estado",
      ["Organização dos Poderes", ["Poder Legislativo", "Poder Executivo", "Poder Judiciário"]],
      "Funções essenciais à justiça",
      "Administração pública na Constituição",
      "Controle de constitucionalidade",
      "Segurança pública",
    ],
  },
  {
    slug: "direito-administrativo",
    name: "Direito Administrativo",
    area: "Direito",
    topics: [
      "Princípios da administração pública",
      "Organização administrativa",
      "Atos administrativos",
      "Poderes administrativos",
      "Agentes públicos",
      "Licitações e contratos",
      "Improbidade administrativa",
      "Responsabilidade civil do Estado",
      "Controle da administração",
      "Processo administrativo",
      "Serviços públicos",
      "Bens públicos",
    ],
  },
  {
    slug: "direito-penal",
    name: "Direito Penal",
    area: "Direito",
    topics: [
      "Aplicação da lei penal",
      ["Teoria do crime", ["Fato típico", "Ilicitude", "Culpabilidade"]],
      "Concurso de pessoas",
      "Teoria da pena",
      "Extinção da punibilidade",
      "Crimes contra a pessoa",
      "Crimes contra o patrimônio",
      "Crimes contra a administração pública",
    ],
  },
  {
    slug: "direito-processual-penal",
    name: "Direito Processual Penal",
    area: "Direito",
    topics: ["Inquérito policial", "Ação penal", "Prisões e medidas cautelares", "Provas", "Competência", "Procedimentos"],
  },
  {
    slug: "direito-previdenciario",
    name: "Direito Previdenciário",
    area: "Direito",
    topics: ["Seguridade social", "Regime geral de previdência social", "Segurados e dependentes", "Custeio da seguridade social", "Benefícios previdenciários"],
  },
  {
    slug: "direito-tributario",
    name: "Direito Tributário",
    area: "Direito",
    topics: ["Sistema tributário nacional", "Competência tributária", "Limitações ao poder de tributar", "Espécies tributárias", "Obrigação tributária", "Crédito tributário", "Administração tributária"],
  },
  {
    slug: "legislacao-transito",
    name: "Legislação de Trânsito",
    area: "Direito",
    topics: ["Sistema Nacional de Trânsito", "Normas gerais de circulação e conduta", "Infrações e penalidades", "Crimes de trânsito", "Habilitação"],
  },
  {
    slug: "contabilidade",
    name: "Contabilidade",
    area: "Específicas",
    topics: ["Conceitos e princípios contábeis", "Patrimônio", "Contas e escrituração", "Balanço patrimonial", "Demonstração do resultado", "Operações com mercadorias", "Depreciação"],
  },
  {
    slug: "matematica-financeira",
    name: "Matemática Financeira",
    area: "Exatas",
    topics: ["Juros simples", "Juros compostos", "Descontos", "Taxas nominal, efetiva e equivalente", "Sistemas de amortização"],
  },
  {
    slug: "conhecimentos-bancarios",
    name: "Conhecimentos Bancários",
    area: "Específicas",
    topics: ["Sistema Financeiro Nacional", "Mercado financeiro", "Produtos e serviços bancários", "Garantias do sistema financeiro", "Prevenção à lavagem de dinheiro"],
  },
  {
    slug: "estatistica",
    name: "Estatística",
    area: "Exatas",
    topics: ["Estatística descritiva", "Medidas de tendência central", "Medidas de dispersão", "Distribuições de probabilidade", "Amostragem", "Correlação e regressão"],
  },
  {
    slug: "historia",
    name: "História",
    area: "Humanas",
    topics: [
      ["História do Brasil", ["Brasil Colônia", "Brasil Império", "Primeira República", "Era Vargas", "República de 1946 a 1964", "Regime militar", "Nova República"]],
      ["História geral", ["Antiguidade", "Idade Média", "Idade Moderna", "Idade Contemporânea"]],
    ],
  },
  {
    slug: "geografia",
    name: "Geografia",
    area: "Humanas",
    topics: [
      "Cartografia",
      ["Geografia física", ["Clima", "Relevo", "Hidrografia", "Vegetação"]],
      "População",
      "Urbanização",
      ["Geografia econômica", ["Agropecuária", "Indústria", "Energia"]],
      "Regiões do Brasil",
      "Globalização e geopolítica",
    ],
  },
];

const MILITARY_STAGES = [
  "Inscrição",
  "Exame intelectual",
  "Inspeção de saúde",
  "Teste de aptidão física",
  "Avaliação psicológica",
  "Verificação documental",
  "Matrícula",
];

const POLICE_STAGES = [
  "Inscrição",
  "Provas objetiva e discursiva",
  "Teste de aptidão física",
  "Avaliação de saúde",
  "Avaliação psicológica",
  "Investigação social",
  "Curso de formação",
];

const PUBLIC_STAGES = ["Inscrição", "Prova objetiva", "Resultado final"];

export interface CompetitionSeed {
  slug: string;
  name: string;
  organization: string;
  position?: string;
  kind: "PUBLIC" | "MILITARY";
  subjects: string[];
  stages: string[];
}

export const COMPETITIONS: CompetitionSeed[] = [
  { slug: "efomm", name: "EFOMM", organization: "Marinha do Brasil — Marinha Mercante", position: "Oficial da Marinha Mercante", kind: "MILITARY", subjects: ["matematica", "fisica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "escola-naval", name: "Escola Naval", organization: "Marinha do Brasil", position: "Aspirante", kind: "MILITARY", subjects: ["matematica", "fisica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "afa", name: "AFA", organization: "Força Aérea Brasileira", position: "Cadete", kind: "MILITARY", subjects: ["matematica", "fisica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "eear", name: "EEAR", organization: "Força Aérea Brasileira", position: "Sargento", kind: "MILITARY", subjects: ["matematica", "fisica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "esa", name: "ESA", organization: "Exército Brasileiro", position: "Sargento", kind: "MILITARY", subjects: ["matematica", "portugues", "historia", "geografia", "ingles"], stages: MILITARY_STAGES },
  { slug: "espcex", name: "EsPCEx", organization: "Exército Brasileiro", position: "Cadete", kind: "MILITARY", subjects: ["matematica", "fisica", "quimica", "portugues", "historia", "geografia", "ingles", "redacao"], stages: MILITARY_STAGES },
  { slug: "ime", name: "IME", organization: "Exército Brasileiro", position: "Engenharia", kind: "MILITARY", subjects: ["matematica", "fisica", "quimica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "ita", name: "ITA", organization: "Força Aérea Brasileira", position: "Engenharia", kind: "MILITARY", subjects: ["matematica", "fisica", "quimica", "portugues", "ingles", "redacao"], stages: MILITARY_STAGES },
  { slug: "colegio-naval", name: "Colégio Naval", organization: "Marinha do Brasil", position: "Aluno", kind: "MILITARY", subjects: ["matematica", "portugues", "ingles"], stages: MILITARY_STAGES },
  { slug: "eam", name: "EAM", organization: "Marinha do Brasil", position: "Aprendiz-Marinheiro", kind: "MILITARY", subjects: ["matematica", "portugues"], stages: MILITARY_STAGES },
  { slug: "policia-federal", name: "Polícia Federal", organization: "Departamento de Polícia Federal", position: "Agente", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "informatica", "direito-constitucional", "direito-administrativo", "direito-penal", "direito-processual-penal"], stages: POLICE_STAGES },
  { slug: "prf", name: "Polícia Rodoviária Federal", organization: "Polícia Rodoviária Federal", position: "Policial Rodoviário Federal", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "informatica", "fisica", "direito-constitucional", "direito-administrativo", "direito-penal", "direito-processual-penal", "legislacao-transito"], stages: POLICE_STAGES },
  { slug: "inss", name: "INSS", organization: "Instituto Nacional do Seguro Social", position: "Técnico do Seguro Social", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "informatica", "direito-constitucional", "direito-administrativo", "direito-previdenciario"], stages: PUBLIC_STAGES },
  { slug: "receita-federal", name: "Receita Federal", organization: "Secretaria Especial da Receita Federal do Brasil", position: "Auditor-Fiscal", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "contabilidade", "direito-tributario", "direito-constitucional", "direito-administrativo"], stages: PUBLIC_STAGES },
  { slug: "banco-do-brasil", name: "Banco do Brasil", organization: "Banco do Brasil S.A.", position: "Escriturário", kind: "PUBLIC", subjects: ["portugues", "matematica", "matematica-financeira", "conhecimentos-bancarios", "informatica", "ingles"], stages: PUBLIC_STAGES },
  { slug: "caixa", name: "Caixa", organization: "Caixa Econômica Federal", position: "Técnico Bancário", kind: "PUBLIC", subjects: ["portugues", "matematica-financeira", "conhecimentos-bancarios", "informatica"], stages: PUBLIC_STAGES },
  { slug: "petrobras", name: "Petrobras", organization: "Petróleo Brasileiro S.A.", kind: "PUBLIC", subjects: ["portugues", "matematica", "ingles"], stages: PUBLIC_STAGES },
  { slug: "transpetro", name: "Transpetro", organization: "Petrobras Transporte S.A.", kind: "PUBLIC", subjects: ["portugues", "matematica", "ingles"], stages: PUBLIC_STAGES },
];

export const CATALOG_SOURCE_NOTE =
  "Estrutura de referência do Vértice, não extraída de edital. Confirme disciplinas, pesos, datas e conteúdos no edital oficial.";
