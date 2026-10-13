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
    topics: ["Sistema tributário nacional", "Competência tributária", "Limitações ao poder de tributar", "Espécies tributárias", "Obrigação tributária", "Crédito tributário", "Administração tributária", "Processo tributário", "Direito financeiro e orçamento público", "Regimes aduaneiros especiais"],
  },
  {
    slug: "direito-civil",
    name: "Direito Civil",
    area: "Direito",
    topics: [
      "Lei de Introdução às Normas do Direito Brasileiro",
      "Pessoas naturais e jurídicas",
      "Bens",
      ["Negócio jurídico", ["Elementos e validade", "Defeitos do negócio jurídico", "Simulação e fraude contra credores", "Prescrição e decadência"]],
      ["Obrigações", ["Modalidades", "Transmissão e extinção", "Inadimplemento", "Cláusula penal e arras"]],
      ["Contratos", ["Teoria geral dos contratos", "Compra e venda", "Doação", "Empreitada", "Prestação de serviços", "Contratos em espécie"]],
      ["Responsabilidade civil", ["Ato ilícito", "Responsabilidade por fato de terceiro", "Dano e reparação"]],
      "Direito das coisas",
      "Direito de família e sucessões",
    ],
  },
  {
    slug: "direito-empresarial",
    name: "Direito Empresarial",
    area: "Direito",
    topics: [
      "Empresário e estabelecimento",
      ["Sociedades", ["Sociedade limitada", "Sociedade anônima", "Administração das companhias", "Reorganização societária"]],
      ["Títulos de crédito", ["Duplicata", "Letra de câmbio e nota promissória", "Cheque"]],
      ["Contratos empresariais", ["Agência e distribuição", "Representação comercial", "Franquia e leasing"]],
      "Recuperação judicial e falência",
      "Propriedade industrial",
    ],
  },
  {
    slug: "direito-do-trabalho",
    name: "Direito do Trabalho",
    area: "Direito",
    topics: [
      "Relação de emprego e empregador",
      ["Contrato de trabalho", ["Alteração do contrato", "Suspensão e interrupção", "Extinção e verbas rescisórias"]],
      "Jornada de trabalho e descansos",
      "Remuneração e salário",
      "Férias e décimo terceiro",
      ["Direito coletivo do trabalho", ["Organização sindical", "Contribuições sindicais", "Negociação coletiva e greve"]],
      ["Processo do trabalho", ["Competência da Justiça do Trabalho", "Exceção de incompetência", "Suspensão do processo", "Recursos trabalhistas"]],
    ],
  },
  {
    slug: "direito-ambiental",
    name: "Direito Ambiental",
    area: "Direito",
    topics: [
      "Princípios do direito ambiental",
      ["Política Nacional do Meio Ambiente", ["SISNAMA", "CONAMA", "Instrumentos da política ambiental"]],
      "Licenciamento ambiental e estudo de impacto",
      "Unidades de conservação",
      "Responsabilidade ambiental",
      "Política Nacional sobre Mudança do Clima",
      "Estatuto da Cidade e estudo de impacto de vizinhança",
    ],
  },
  {
    slug: "direito-internacional",
    name: "Direito Internacional",
    area: "Direito",
    topics: [
      "Fontes do direito internacional e tratados",
      ["Direito internacional privado", ["Lei aplicável e elementos de conexão", "Estatuto pessoal e domicílio", "Regime de bens e capacidade"]],
      ["Contratos internacionais", ["Cláusula hardship", "Força maior e eleição de foro", "Compra e venda internacional"]],
      ["Cooperação jurídica internacional", ["Homologação de sentença estrangeira", "Carta rogatória", "Auxílio direto"]],
      "Arbitragem internacional",
      "Organizações internacionais",
    ],
  },
  {
    slug: "direito-maritimo",
    name: "Direito Marítimo",
    area: "Direito",
    topics: [
      ["Registro da Propriedade Marítima", ["Inscrição e propriedade da embarcação", "Documentos do armador"]],
      "Armador, embarcação e tripulação",
      ["Tribunal Marítimo", ["Composição e competência", "Fatos e acidentes da navegação", "Processo perante o Tribunal Marítimo"]],
      "Contratos de transporte marítimo e afretamento",
      "Autoridade marítima e segurança da navegação",
    ],
  },
  {
    slug: "seguranca-saude-trabalho",
    name: "Segurança e Saúde no Trabalho",
    area: "Direito",
    topics: [
      "Normas Regulamentadoras",
      "CIPA (NR 5)",
      "Equipamento de proteção individual (NR 6)",
      "PCMSO (NR 7)",
      "Programa de prevenção de riscos ambientais (NR 9)",
      "Insalubridade e periculosidade (NR 15 e NR 16)",
      "Acidente de trabalho e CAT",
    ],
  },
  {
    slug: "legislacao-transito",
    name: "Legislação de Trânsito",
    area: "Direito",
    topics: ["Sistema Nacional de Trânsito", "Normas gerais de circulação e conduta", "Infrações e penalidades", "Crimes de trânsito", "Habilitação"],
  },
  {
    slug: "economia",
    name: "Economia e Finanças Públicas",
    area: "Específicas",
    topics: [
      ["Microeconomia", ["Teoria do consumidor", "Bens substitutos e complementares", "Teoria da firma e custos", "Estruturas de mercado", "Monopólio e poder de mercado", "Teoria dos jogos"]],
      ["Macroeconomia", ["Contas nacionais", "Moeda e inflação", "Política monetária", "Política fiscal", "Setor externo e balanço de pagamentos"]],
      ["Finanças públicas", ["Funções econômicas do Estado", "Ingressos e receitas públicas", "Necessidades de financiamento do setor público", "Dívida pública", "Tributação e eficiência econômica"]],
    ],
  },
  {
    slug: "administracao-geral",
    name: "Administração Geral",
    area: "Específicas",
    topics: [
      "Teorias da administração",
      ["Processo administrativo", ["Planejamento", "Organização", "Direção", "Controle"]],
      ["Estrutura organizacional", ["Departamentalização", "Centralização e descentralização"]],
      ["Planejamento estratégico", ["Balanced Scorecard", "Indicadores de desempenho"]],
      "Gestão da qualidade",
      "Comportamento organizacional",
      ["Gestão de pessoas", ["Avaliação de desempenho", "Avaliação 360 graus", "Liderança e motivação"]],
      "Gestão de projetos",
    ],
  },
  {
    slug: "administracao-publica",
    name: "Administração Pública",
    area: "Específicas",
    topics: [
      ["Modelos de administração pública", ["Patrimonialista", "Burocrático", "Gerencial", "Governança e novo serviço público"]],
      ["Políticas públicas", ["Ciclo de políticas públicas", "Formação de agenda", "Estado-rede e redes de políticas públicas", "Avaliação de políticas públicas"]],
      "Accountability e controle social",
      ["Gestão de riscos no setor público", ["Modelos de referência e COSO", "Três linhas de defesa"]],
      "Integridade e combate à corrupção",
      "Compras governamentais e contratações sustentáveis",
      "Gestão por resultados",
    ],
  },
  {
    slug: "auditoria",
    name: "Auditoria",
    area: "Específicas",
    topics: [
      "Normas brasileiras de contabilidade aplicadas à auditoria",
      ["Planejamento da auditoria", ["Risco de auditoria", "Relevância e materialidade", "Conhecimento da entidade"]],
      "Controles internos",
      ["Evidência e procedimentos", ["Testes de detalhes", "Procedimentos analíticos", "Amostragem em auditoria", "Confirmações externas"]],
      ["Auditoria das contas patrimoniais", ["Ativo imobilizado", "Estoques", "Passivos e passivos fictícios", "Receitas e despesas"]],
      "Fraude e erro",
      "Relatório do auditor independente",
      "Trabalhos de asseguração",
    ],
  },
  {
    slug: "tecnologia-informacao",
    name: "Tecnologia da Informação",
    area: "Tecnologia",
    topics: [
      "Algoritmos e lógica de programação",
      ["Programação", ["Python", "Linguagem R", "Estruturas de dados"]],
      ["Banco de dados", ["Modelo relacional e SQL", "NoSQL e teorema CAP", "Data warehouse e modelagem dimensional"]],
      "Análise de dados",
      ["Inteligência artificial", ["Aprendizado de máquina", "Processamento de linguagem natural", "IA responsável e explicável"]],
      "Computação em nuvem",
      "Segurança da informação e proteção de dados",
    ],
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
    slug: "vendas-negociacao",
    name: "Vendas e Negociação",
    area: "Específicas",
    topics: [
      "Noções de administração de vendas",
      "Planejamento e previsão de vendas",
      "Técnicas de vendas e etapas da venda",
      "Negociação: preparação, estratégias e táticas",
      "Relacionamento e fidelização de clientes",
      "Atendimento e experiência do cliente",
      "Marketing de relacionamento e pós-venda",
      "Código de Defesa do Consumidor aplicado ao setor bancário",
      "Ética e conduta na relação com o cliente",
    ],
  },
  {
    slug: "atendimento-bancario",
    name: "Atendimento Bancário",
    area: "Específicas",
    topics: [
      "Qualidade no atendimento ao cliente",
      "Segmentação de clientes",
      "Atendimento presencial, telefônico e digital",
      "Acessibilidade e atendimento prioritário",
      "Sigilo bancário e proteção de dados do cliente",
      "Resolução de conflitos e ouvidoria",
      "Código de Defesa do Consumidor no atendimento",
    ],
  },
  {
    slug: "ciencias",
    name: "Ciências",
    area: "Exatas",
    topics: [
      ["Matéria e energia", ["Propriedades da matéria", "Misturas e separação", "Estrutura atômica e tabela periódica", "Ligações e reações químicas", "Formas de energia e transformações"]],
      ["Física básica", ["Movimento e velocidade", "Força e máquinas simples", "Pressão e vasos comunicantes", "Calor e temperatura", "Luz e som", "Eletricidade e magnetismo"]],
      ["Vida e evolução", ["Célula", "Corpo humano e sistemas", "Seres vivos e classificação", "Ecologia e meio ambiente"]],
      ["Terra e Universo", ["Sistema Solar", "Movimentos da Terra", "Atmosfera e clima", "Rochas e solo"]],
    ],
  },
  {
    slug: "atualidades-mercado-financeiro",
    name: "Atualidades do Mercado Financeiro",
    area: "Específicas",
    topics: [
      "Sistema financeiro nacional e sua evolução recente",
      "Dinâmica do mercado bancário",
      "Bancos digitais e fintechs",
      "Meios de pagamento e Pix",
      "Open finance e compartilhamento de dados",
      "Moedas digitais e criptoativos",
      "Sustentabilidade e ESG no setor financeiro",
      "Inovação e transformação digital nos bancos",
    ],
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
  { slug: "colegio-naval", name: "Colégio Naval", organization: "Marinha do Brasil", position: "Aluno", kind: "MILITARY", subjects: ["matematica", "portugues", "ingles", "historia", "geografia", "ciencias"], stages: MILITARY_STAGES },
  { slug: "eam", name: "EAM", organization: "Marinha do Brasil", position: "Aprendiz-Marinheiro", kind: "MILITARY", subjects: ["matematica", "portugues", "ingles", "ciencias"], stages: MILITARY_STAGES },
  { slug: "policia-federal", name: "Polícia Federal", organization: "Departamento de Polícia Federal", position: "Agente", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "estatistica", "informatica", "contabilidade", "direito-constitucional", "direito-administrativo", "direito-penal", "direito-processual-penal"], stages: POLICE_STAGES },
  { slug: "prf", name: "Polícia Rodoviária Federal", organization: "Polícia Rodoviária Federal", position: "Policial Rodoviário Federal", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "informatica", "fisica", "geografia", "direito-constitucional", "direito-administrativo", "direito-penal", "direito-processual-penal", "legislacao-transito"], stages: POLICE_STAGES },
  { slug: "inss", name: "INSS", organization: "Instituto Nacional do Seguro Social", position: "Técnico do Seguro Social", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "informatica", "direito-constitucional", "direito-administrativo", "direito-previdenciario"], stages: PUBLIC_STAGES },
  { slug: "receita-federal", name: "Receita Federal", organization: "Secretaria Especial da Receita Federal do Brasil", position: "Auditor-Fiscal", kind: "PUBLIC", subjects: ["portugues", "raciocinio-logico", "estatistica", "economia", "administracao-geral", "administracao-publica", "auditoria", "contabilidade", "tecnologia-informacao", "direito-tributario", "direito-constitucional", "direito-administrativo"], stages: PUBLIC_STAGES },
  { slug: "banco-do-brasil", name: "Banco do Brasil", organization: "Banco do Brasil S.A.", position: "Escriturário", kind: "PUBLIC", subjects: ["portugues", "ingles", "matematica", "atualidades-mercado-financeiro", "matematica-financeira", "conhecimentos-bancarios", "informatica", "vendas-negociacao"], stages: PUBLIC_STAGES },
  { slug: "caixa", name: "Caixa", organization: "Caixa Econômica Federal", position: "Técnico Bancário", kind: "PUBLIC", subjects: ["portugues", "matematica-financeira", "conhecimentos-bancarios", "estatistica", "informatica", "atendimento-bancario"], stages: PUBLIC_STAGES },
  { slug: "petrobras", name: "Petrobras", organization: "Petróleo Brasileiro S.A.", kind: "PUBLIC", subjects: ["portugues", "matematica", "ingles"], stages: PUBLIC_STAGES },
  { slug: "petrobras-advogado", name: "Petrobras", organization: "Petróleo Brasileiro S.A.", position: "Advogado Júnior", kind: "PUBLIC", subjects: ["portugues", "ingles", "direito-empresarial", "direito-civil", "direito-administrativo", "direito-tributario", "direito-constitucional", "direito-ambiental", "direito-do-trabalho", "direito-maritimo", "direito-internacional", "seguranca-saude-trabalho"], stages: PUBLIC_STAGES },
  { slug: "transpetro", name: "Transpetro", organization: "Petrobras Transporte S.A.", kind: "PUBLIC", subjects: ["portugues", "matematica", "ingles"], stages: PUBLIC_STAGES },
];

export const CATALOG_SOURCE_NOTE =
  "Estrutura de referência do Vértice, não extraída de edital. Confirme disciplinas, pesos, datas e conteúdos no edital oficial.";
