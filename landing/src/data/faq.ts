export type FaqEntry = { id: string; question: string; answer: string[] };

export const faq: FaqEntry[] = [
  {
    id: "o-que-e",
    question: "O que é o VÉRTICE?",
    answer: [
      "Uma plataforma de preparação autônoma para concursos públicos e militares. Ela reúne edital, rotina, plano de estudos, questões, revisões, simulados e desempenho em um único sistema, e usa esses dados para indicar o que estudar em seguida.",
    ],
  },
  {
    id: "concursos",
    question: "Para quais concursos posso usar?",
    answer: [
      "Concursos públicos e militares em geral. O catálogo traz concursos de referência, e você pode personalizar o edital com as disciplinas, os tópicos e os pesos oficiais do seu concurso.",
      "Datas, pesos e notas de corte só aparecem quando cadastrados. O que não foi verificado é marcado como tal.",
    ],
  },
  {
    id: "cursinho",
    question: "O VÉRTICE substitui um cursinho?",
    answer: [
      "Não é essa a proposta. Um cursinho ensina o conteúdo; o VÉRTICE organiza e acompanha a sua preparação. Você pode usar os dois juntos: estudar pelo material que preferir e usar a plataforma para planejar, revisar, praticar e medir.",
    ],
  },
  {
    id: "planejamento",
    question: "Como funciona o planejamento?",
    answer: [
      "O plano da semana é montado a partir do edital, dos seus horários livres, da data da prova e do seu desempenho. Cada sessão mostra por que foi escolhida: peso da matéria, resultado recente, tempo desde a última revisão.",
    ],
  },
  {
    id: "rotina",
    question: "Posso adaptar minha rotina?",
    answer: [
      "Sim. Você informa compromissos fixos e horários disponíveis por dia. Compromissos fixos nunca são movidos, e conteúdos mais exigentes vão para os horários em que você rende mais.",
    ],
  },
  {
    id: "adaptacao",
    question: "O planejamento muda conforme meu desempenho?",
    answer: [
      "O VÉRTICE sugere ajustes quando os dados mudam — uma matéria abaixo da meta, revisões acumuladas, a prova se aproximando. Nenhuma sugestão altera o plano sem a sua decisão: você aceita, edita ou ignora, e pode desfazer. Só pequenos ajustes que você autorizar nas configurações são aplicados automaticamente.",
    ],
  },
  {
    id: "militares",
    question: "Posso usar para concursos militares?",
    answer: [
      "Sim. Há uma área militar com etapas configuráveis do concurso e acompanhamento do treinamento físico, separada do conteúdo acadêmico.",
    ],
  },
  {
    id: "taf",
    question: "O VÉRTICE possui controle de TAF?",
    answer: [
      "Sim. Você registra corrida, flexões, abdominais, barra, natação e outras provas, define metas e acompanha a evolução de cada modalidade. Os índices exigidos devem ser conferidos no edital oficial do seu concurso.",
    ],
  },
  {
    id: "questoes",
    question: "Existem questões e simulados?",
    answer: [
      "Sim. O banco reúne questões de provas oficiais anteriores e questões geradas por IA no estilo delas, sempre revisadas antes da publicação e identificadas como tal. Você também monta simulados completos ou personalizados, com tempo de prova.",
    ],
  },
  {
    id: "desempenho",
    question: "Posso acompanhar meu desempenho?",
    answer: [
      "Sim. Você acompanha horas estudadas, planejado contra realizado, taxa de acertos por matéria e assunto, evolução nos simulados e revisões pendentes, além de um Índice de Preparação que mostra o que sustenta o número e o que falta.",
    ],
  },
  {
    id: "garantia",
    question: "O VÉRTICE garante aprovação?",
    answer: [
      "Não. O VÉRTICE é uma ferramenta de organização, acompanhamento e preparação. Ele ajuda a usar melhor o tempo que você tem e a enxergar onde concentrar esforço.",
      "A aprovação depende de muitos fatores fora da plataforma: dedicação, base de conhecimento, número de vagas, concorrência, condições no dia da prova e as regras de cada edital. O Índice de Preparação resume evidências de estudo e não representa chance de aprovação.",
    ],
  },
];
