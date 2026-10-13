/**
 * Categorias e exemplos de concursos que o estudante pode organizar no VÉRTICE.
 * São exemplos de uso, não parcerias: a interface sempre acompanha o aviso de não afiliação.
 */
export const contestCategories = [
  "Concursos públicos",
  "Concursos militares",
  "Carreiras policiais",
  "Empresas públicas",
  "Tribunais",
  "Área fiscal",
  "Área bancária",
] as const;

export const contestExamples = [
  "EFOMM",
  "Escola Naval",
  "AFA",
  "EEAR",
  "ESA",
  "EsPCEx",
  "PF",
  "PRF",
  "INSS",
  "Receita Federal",
  "Banco do Brasil",
  "Caixa",
  "Petrobras",
] as const;

/** Exemplos agrupados por tipo de preparação. Categorias sem exemplo citado mostram só a descrição. */
export const contestGroups: { category: (typeof contestCategories)[number]; body: string; examples: string[] }[] = [
  { category: "Concursos militares", body: "Prova escrita, etapas físicas e calendário próprio.", examples: ["EFOMM", "Escola Naval", "AFA", "EEAR", "ESA", "EsPCEx"] },
  { category: "Carreiras policiais", body: "Conteúdo extenso e TAF na mesma preparação.", examples: ["PF", "PRF"] },
  { category: "Concursos públicos", body: "Editais amplos, com disciplinas básicas e específicas.", examples: ["INSS"] },
  { category: "Área fiscal", body: "Muitas disciplinas com pesos diferentes.", examples: ["Receita Federal"] },
  { category: "Área bancária", body: "Conhecimentos bancários, matemática e atualidades.", examples: ["Banco do Brasil", "Caixa"] },
  { category: "Empresas públicas", body: "Provas por cargo e ênfase.", examples: ["Petrobras"] },
  { category: "Tribunais", body: "Legislação específica e alto volume de questões.", examples: [] },
];

export const militaryExamples = ["EFOMM", "Escola Naval", "AFA", "EEAR", "ESA", "EsPCEx", "IME", "ITA"] as const;

/** Situação dos dados de cada concurso, como aparece no aplicativo. */
export const dataStatuses = [
  { label: "Verificado", body: "Conferido com a publicação oficial.", tone: "positive" as const },
  { label: "Não verificado", body: "Sem confirmação oficial. Datas, pesos e notas de corte não são exibidos.", tone: "warning" as const },
  { label: "Informado por você", body: "Dados do edital que você cadastrou ou ajustou.", tone: "info" as const },
];

export const affiliationNotice =
  "Nomes citados como exemplos de concursos que podem ser organizados na plataforma. O VÉRTICE não é afiliado a bancas, órgãos públicos ou Forças Armadas.";
