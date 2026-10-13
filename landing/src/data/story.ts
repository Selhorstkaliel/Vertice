/** Conteúdo editorial das seções de problema, fluxo e diferencial. */

export const problems = [
  { title: "Cronograma impossível de cumprir", body: "O plano ignora trabalho, deslocamento e cansaço, e na segunda semana já está atrasado." },
  { title: "Revisões esquecidas", body: "O conteúdo estudado há um mês volta na prova como se fosse novo." },
  { title: "Matérias sem prioridade", body: "Horas vão para o que é confortável, não para o que pesa mais no edital." },
  { title: "Evolução sem controle", body: "Sem números, a sensação de progresso substitui o progresso." },
  { title: "Questões sem análise", body: "Resolver e conferir o gabarito não diz por que o erro aconteceu." },
  { title: "Erros repetidos", body: "O mesmo tipo de erro reaparece porque ninguém registrou o padrão." },
  { title: "Rotina diferente do plano", body: "A semana real muda, o cronograma fica parado." },
  { title: "Nenhuma adaptação perto da prova", body: "A reta final pede outra distribuição, e o plano continua igual." },
] as const;

export const comparison = [
  { without: "Cronograma estático", with: "Plano adaptativo" },
  { without: "Prioridades confusas", with: "Prioridades calculadas" },
  { without: "Revisões manuais", with: "Revisões programadas" },
  { without: "Dados espalhados", with: "Desempenho centralizado" },
  { without: "Decisões no improviso", with: "Próxima ação clara" },
] as const;

export const steps = [
  {
    title: "Escolha seu objetivo",
    body: "Selecione o concurso, o cargo e a data da prova.",
    inputs: ["Concurso", "Cargo", "Data da prova"],
  },
  {
    title: "Organize sua realidade",
    body: "O VÉRTICE considera os dias disponíveis, os horários e as limitações da sua rotina.",
    inputs: ["Dias livres", "Horários", "Compromissos fixos"],
  },
  {
    title: "Receba sua estratégia",
    body: "A plataforma distribui matérias, revisões, questões e simulados no tempo que você tem.",
    inputs: ["Matérias", "Revisões", "Simulados"],
  },
  {
    title: "Evolua com seus dados",
    body: "Conforme o desempenho muda, o planejamento pode ser reavaliado.",
    inputs: ["Acertos", "Tempo", "Reavaliação"],
  },
] as const;

export const traditionalPrep = ["Planilha", "PDF do edital", "Cronograma fixo", "Dados fragmentados", "Controle manual"] as const;

export const verticePrep = [
  "Edital conectado",
  "Rotina estruturada",
  "Questões",
  "Revisões",
  "Erros",
  "Simulados",
  "Performance",
  "Planejamento adaptativo",
] as const;
