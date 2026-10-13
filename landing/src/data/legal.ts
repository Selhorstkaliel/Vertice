/**
 * Termos de uso, política de privacidade e contato.
 *
 * Os textos descrevem o funcionamento real da plataforma (conta, dados de estudo, Mentor com IA,
 * cookie de sessão e registros de segurança). Antes de abrir cadastros ao público, preencha
 * `legalConfig` e submeta os documentos à revisão de um advogado: eles são um ponto de partida
 * honesto, não uma peça jurídica pronta.
 *
 * Nos textos, {responsavel} e {contato} são trocados pelos valores de `legalConfig`.
 */

export const legalConfig = {
  /** Enquanto `false`, as páginas avisam que os documentos ainda não estão em vigor. */
  published: false,

  /** PREENCHER: quem responde legalmente pela plataforma (nome completo, ou razão social e CNPJ). */
  controller: "",

  /** PREENCHER: e-mail oficial de contato, suporte e pedidos de privacidade. */
  contactEmail: "",

  /** Data da última revisão dos textos (ISO). */
  updatedAt: "2026-09-15",
} as const;

export type LegalSection = { heading: string; paragraphs?: string[]; list?: string[] };

export const CONTROLLER_FALLBACK = "o responsável pela plataforma (a ser informado)";
export const CONTACT_FALLBACK = "o canal oficial, que ainda será publicado na página de contato";

/** Troca os marcadores pelos valores configurados, ou por um texto neutro enquanto faltarem. */
export function fillTokens(text: string) {
  return text
    .replaceAll("{responsavel}", legalConfig.controller || CONTROLLER_FALLBACK)
    .replaceAll("{contato}", legalConfig.contactEmail || CONTACT_FALLBACK);
}

export const terms: LegalSection[] = [
  {
    heading: "1. Quem oferece o VÉRTICE",
    paragraphs: [
      "O VÉRTICE é uma plataforma de organização e acompanhamento de estudos para concursos públicos e militares, oferecida por {responsavel}.",
      "Ao criar uma conta ou usar a plataforma, você concorda com estes termos. Se não concordar, não use o serviço.",
    ],
  },
  {
    heading: "2. O que a plataforma faz",
    paragraphs: [
      "O VÉRTICE reúne edital, rotina, plano de estudos, questões, revisões, flashcards, simulados, metas, calendário, desempenho e, em concursos com etapa física, o registro do treinamento. A partir desses dados, ele sugere o que estudar em seguida e mostra o motivo de cada sugestão.",
      "Sugestões do planejador e do Mentor não alteram seu plano sem a sua decisão, exceto os ajustes pequenos que você autorizar nas configurações.",
    ],
  },
  {
    heading: "3. O que a plataforma não faz",
    paragraphs: [
      "O VÉRTICE não garante aprovação, classificação, nota mínima nem qualquer resultado em concursos. Aprovação depende de fatores fora da plataforma, como dedicação, base de conhecimento, número de vagas, concorrência, condições no dia da prova e as regras de cada edital.",
      "O Índice de Preparação resume evidências do seu estudo registrado. Não é probabilidade de aprovação.",
      "O VÉRTICE não é afiliado a bancas, órgãos públicos, escolas de formação ou Forças Armadas, e não fala em nome delas. Datas, pesos, etapas e notas de corte exibidos na plataforma só valem como referência: confira sempre o edital oficial.",
    ],
  },
  {
    heading: "4. Sua conta",
    paragraphs: [
      "Para usar a plataforma é preciso criar uma conta com e-mail e senha. Você é responsável por manter a senha em sigilo e por tudo o que acontecer na sua conta.",
      "Use dados verdadeiros e um e-mail ao qual você tenha acesso. Uma conta é pessoal e não deve ser compartilhada.",
      "Menores de 18 anos só podem usar a plataforma com o consentimento e sob a supervisão dos pais ou responsáveis.",
      "Avise pelo canal de contato ({contato}) se suspeitar de uso indevido da sua conta.",
    ],
  },
  {
    heading: "5. Uso aceitável",
    paragraphs: ["Ao usar o VÉRTICE, você concorda em não:"],
    list: [
      "acessar contas de terceiros ou tentar burlar autenticação, limites de uso ou mecanismos de segurança;",
      "extrair o conteúdo da plataforma em massa, por raspagem ou automação, nem redistribuir esse conteúdo;",
      "enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros;",
      "interferir no funcionamento do serviço ou sobrecarregá-lo de forma deliberada.",
    ],
  },
  {
    heading: "6. Conteúdo da plataforma e conteúdo seu",
    paragraphs: [
      "As questões do banco vêm de provas anteriores publicadas pelos próprios órgãos ou são geradas por inteligência artificial no estilo delas, sempre revisadas antes da publicação e identificadas como tal. Resoluções escritas com auxílio de IA são conferidas com o gabarito oficial, mas podem conter erros: em caso de divergência, o gabarito oficial prevalece.",
      "O conteúdo que você cria — anotações, flashcards, metas, registros de estudo — continua sendo seu. Você concede ao VÉRTICE apenas a permissão necessária para armazenar e processar esse conteúdo e prestar o serviço.",
      "A marca, o código e a interface do VÉRTICE pertencem a {responsavel} e não podem ser copiados ou reutilizados sem autorização.",
    ],
  },
  {
    heading: "7. Planos e pagamento",
    paragraphs: [
      "Enquanto não houver planos pagos publicados, o uso da plataforma não é cobrado.",
      "Quando os planos forem publicados, os valores, o que cada plano inclui, a forma de cobrança e as regras de cancelamento e reembolso serão informados antes da contratação, e estes termos serão atualizados.",
    ],
  },
  {
    heading: "8. Disponibilidade e mudanças",
    paragraphs: [
      "O serviço é oferecido no estado em que se encontra e pode passar por manutenções, interrupções e mudanças de recursos. Faremos o possível para avisar com antecedência sobre mudanças relevantes.",
      "Recursos podem ser alterados ou descontinuados. Se uma mudança reduzir de forma significativa o que você contratou, você será avisado.",
    ],
  },
  {
    heading: "9. Encerramento",
    paragraphs: [
      "Você pode encerrar sua conta a qualquer momento nas configurações da plataforma. O encerramento apaga seus dados, conforme descrito na política de privacidade.",
      "Podemos suspender ou encerrar contas que violem estes termos, com aviso sempre que possível.",
    ],
  },
  {
    heading: "10. Limitação de responsabilidade",
    paragraphs: [
      "O VÉRTICE responde pelos danos diretos que causar, nos limites da lei. Não respondemos por decisões de estudo tomadas com base nas sugestões da plataforma, por resultados em concursos, nem por informações de editais que você tenha cadastrado ou que não estejam verificadas no sistema.",
      "Nada nestes termos afasta os direitos que a legislação brasileira, em especial o Código de Defesa do Consumidor, garante a você.",
    ],
  },
  {
    heading: "11. Alterações nestes termos",
    paragraphs: [
      "Estes termos podem ser atualizados. A data da última revisão fica no início desta página, e mudanças relevantes serão comunicadas na plataforma antes de entrarem em vigor.",
    ],
  },
  {
    heading: "12. Lei aplicável e foro",
    paragraphs: [
      "Estes termos são regidos pela legislação brasileira. Fica eleito o foro do domicílio do usuário para resolver qualquer questão decorrente deles.",
    ],
  },
  {
    heading: "13. Contato",
    paragraphs: ["Dúvidas sobre estes termos: {contato}."],
  },
];

export const privacy: LegalSection[] = [
  {
    heading: "1. Quem trata seus dados",
    paragraphs: [
      "O responsável pelo tratamento dos dados pessoais na plataforma é {responsavel}. Pedidos relacionados a privacidade podem ser enviados para {contato}.",
      "Esta política explica quais dados o VÉRTICE coleta, por que coleta, com quem compartilha e o que você pode pedir a respeito deles.",
    ],
  },
  {
    heading: "2. Dados que coletamos",
    paragraphs: ["A plataforma trata três grupos de dados:"],
    list: [
      "Dados de cadastro: nome, e-mail, senha (guardada apenas como hash, nunca em texto) e, se você enviar, uma foto de perfil.",
      "Dados da sua preparação: concurso e cargo escolhidos, edital e tópicos, rotina e horários, plano de estudos, sessões e tempo estudado, questões respondidas e erros, flashcards e revisões, simulados, metas, eventos do calendário, registros de treinamento físico e mensagens trocadas com o Mentor.",
      "Dados técnicos e de segurança: registros de acesso e de tentativas de login, endereço de IP usado para limitar tentativas, além de eventos como troca de senha, exportação de dados e encerramento de conta.",
    ],
  },
  {
    heading: "3. Por que tratamos esses dados",
    list: [
      "Para prestar o serviço que você contratou: montar e ajustar o plano, registrar seu estudo e mostrar seu desempenho (execução de contrato).",
      "Para manter a plataforma segura e disponível, incluindo limites de tentativas de login e registros de segurança (legítimo interesse).",
      "Para responder às suas mensagens e pedidos (legítimo interesse).",
      "Para cumprir obrigações legais, quando aplicável.",
    ],
  },
  {
    heading: "4. Mentor e provedores de inteligência artificial",
    paragraphs: [
      "Quando você usa o Mentor, sua mensagem e os dados da sua preparação consultados para respondê-la são enviados ao provedor de IA configurado na plataforma. A tela do Mentor e a de configurações informam qual provedor está em uso.",
      "Em planos gratuitos de alguns provedores, o conteúdo enviado pode ser usado por eles para melhorar os próprios produtos. Se você não quiser esse envio, não use o Mentor: o restante da plataforma, incluindo as análises calculadas por regras, continua funcionando.",
      "As provas oficiais importadas pela administração também são enviadas ao provedor de IA para leitura. Nenhum dado de estudante acompanha esse envio.",
    ],
  },
  {
    heading: "5. Com quem compartilhamos",
    paragraphs: [
      "Não vendemos dados pessoais e não os usamos para publicidade.",
      "Compartilhamos apenas com quem é necessário para o serviço funcionar: a hospedagem da aplicação e do banco de dados e o provedor de IA do Mentor. Esses fornecedores podem estar fora do Brasil, o que implica transferência internacional de dados, feita apenas na medida necessária para prestar o serviço.",
      "Também podemos compartilhar dados para cumprir ordem judicial ou obrigação legal.",
    ],
  },
  {
    heading: "6. Cookies",
    paragraphs: [
      "A plataforma usa um cookie de sessão, essencial para manter você conectado com segurança. Sem ele, não é possível usar a área logada.",
      "Não usamos cookies de publicidade. Se um dia a plataforma passar a usar medição de audiência, esta política será atualizada e o consentimento será pedido antes.",
    ],
  },
  {
    heading: "7. Por quanto tempo guardamos",
    paragraphs: [
      "Seus dados ficam guardados enquanto sua conta existir. Ao encerrar a conta, os dados da sua preparação são apagados.",
      "Registros de segurança podem ser mantidos por prazo adicional, quando necessário para proteger a plataforma ou cumprir a lei.",
    ],
  },
  {
    heading: "8. Seus direitos",
    paragraphs: ["Pela Lei Geral de Proteção de Dados, você pode pedir a qualquer momento:"],
    list: [
      "confirmação de que tratamos seus dados e acesso a eles;",
      "correção de dados incompletos ou desatualizados;",
      "exportação dos seus dados em formato legível por máquina, disponível na própria plataforma;",
      "eliminação dos dados e encerramento da conta, também disponível na plataforma;",
      "informação sobre com quem compartilhamos seus dados;",
      "revogação do consentimento, quando o tratamento se basear nele.",
    ],
  },
  {
    heading: "9. Segurança",
    paragraphs: [
      "As senhas são guardadas apenas como hash. A sessão usa cookie protegido, exigindo conexão segura em produção. Há limite de tentativas de login por conta e por endereço de IP, e eventos sensíveis ficam registrados.",
      "Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança com risco relevante aos seus dados, você e a autoridade competente serão comunicados.",
    ],
  },
  {
    heading: "10. Crianças e adolescentes",
    paragraphs: [
      "A plataforma não se destina a menores de 18 anos sem o consentimento e a supervisão dos pais ou responsáveis. Se identificarmos uma conta criada sem esse consentimento, ela poderá ser encerrada.",
    ],
  },
  {
    heading: "11. Mudanças nesta política",
    paragraphs: [
      "Esta política pode ser atualizada. A data da última revisão fica no início da página, e mudanças relevantes serão comunicadas na plataforma antes de entrarem em vigor.",
    ],
  },
  {
    heading: "12. Contato",
    paragraphs: ["Para exercer seus direitos ou tirar dúvidas sobre privacidade, escreva para {contato}."],
  },
];
