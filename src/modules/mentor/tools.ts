import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DomainError } from "@/lib/action";
import { db } from "@/lib/db";
import { parseClock } from "@/lib/format";
import { isDateKey } from "@/lib/time";
import { ROUTINE_CATEGORY_LABEL } from "@/lib/labels";
import { proposeRedistribution } from "@/modules/plan/service";
import { createGoalProposal, createRoutineProposal } from "@/modules/recommendations/service";
import * as data from "./data";

type Tool = Anthropic.Beta.BetaTool;

const CATEGORY_KEYS = Object.keys(ROUTINE_CATEGORY_LABEL) as [keyof typeof ROUTINE_CATEGORY_LABEL, ...(keyof typeof ROUTINE_CATEGORY_LABEL)[]];
const categoryHelp = CATEGORY_KEYS.map((k) => `${k} (${ROUTINE_CATEGORY_LABEL[k].toLowerCase()})`).join(", ");

export const MAX_PROPOSALS_PER_TURN = 3;

/** Labels shown to the student while a tool runs and under the answer ("Dados consultados"). */
export const TOOL_LABELS: Record<string, { running: string; source: string }> = {
  visao_geral: { running: "Consultando visão geral", source: "Visão geral" },
  plano_de_estudos: { running: "Consultando seu plano", source: "Plano" },
  rotina: { running: "Consultando sua rotina", source: "Rotina" },
  desempenho: { running: "Analisando seu desempenho", source: "Desempenho" },
  edital: { running: "Consultando o edital", source: "Edital" },
  caderno_de_erros: { running: "Consultando o caderno de erros", source: "Caderno de erros" },
  flashcards: { running: "Consultando seus flashcards", source: "Flashcards" },
  simulados: { running: "Consultando seus simulados", source: "Simulados" },
  sessoes_de_estudo: { running: "Consultando suas sessões", source: "Sessões de estudo" },
  banco_de_questoes: { running: "Consultando o banco de questões", source: "Questões" },
  propor_ajuste_rotina: { running: "Preparando sugestão de rotina", source: "Sugestão de rotina" },
  propor_ajuste_metas: { running: "Preparando sugestão de metas", source: "Sugestão de metas" },
  propor_redistribuicao: { running: "Buscando novos horários", source: "Redistribuição" },
};

const noInput = { type: "object" as const, properties: {}, additionalProperties: false };

export const MENTOR_TOOLS: Tool[] = [
  {
    name: "visao_geral",
    description:
      "Resumo atual do estudante: data e hora locais, preferências (meta semanal, limite diário, duração máxima de sessão), concursos com banca e data da prova (ou 'Informação não verificada'), Índice de Preparação com componentes, execução da semana, sequência de dias e pendências. Use no início de conversas sobre a situação geral.",
    input_schema: noInput,
  },
  {
    name: "plano_de_estudos",
    description:
      "Sessões do plano semanal com horário, tipo, disciplina, tópico, status e o motivo registrado pelo planejador (campo 'porque' e 'fatores'). Use para responder por que algo está no plano, o que estudar hoje e como está a execução. Informe 'data' (AAAA-MM-DD) para um único dia.",
    input_schema: {
      type: "object",
      properties: {
        semana: { type: "string", enum: ["atual", "proxima"], description: "Semana a consultar. Padrão: atual." },
        data: { type: "string", description: "Dia específico no formato AAAA-MM-DD." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "rotina",
    description:
      "Rotina semanal: blocos por dia (com id, horário, categoria, rótulo e se é fixo), energia por período do dia e a análise do sistema (capacidade de estudo, carga recomendada, sustentabilidade, risco de sobrecarga e diagnósticos). Consulte antes de propor qualquer mudança de rotina.",
    input_schema: noInput,
  },
  {
    name: "desempenho",
    description:
      "Desempenho em questões por semana e por disciplina, tópicos mais fracos, simulados recentes, histórico do Índice de Preparação e observações calculadas com base mínima de dados.",
    input_schema: {
      type: "object",
      properties: { semanas: { type: "integer", enum: [4, 8, 12], description: "Período em semanas. Padrão: 8." } },
      additionalProperties: false,
    },
  },
  {
    name: "edital",
    description:
      "Edital verticalizado de um concurso da lista do estudante. Sem 'disciplina': disciplinas com peso (ou 'Informação não verificada'), cobertura e acerto. Com 'disciplina': tópicos com status, questões, acerto, erros e revisões.",
    input_schema: {
      type: "object",
      properties: {
        concursoId: { type: "string", description: "Id do concurso (de visao_geral). Padrão: concurso principal." },
        disciplina: { type: "string", description: "Nome da disciplina, por exemplo 'Física'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "caderno_de_erros",
    description: "Caderno de erros: totais, motivos dos erros, tópicos e disciplinas com mais erros nos últimos 90 dias e erros recentes ainda em aberto.",
    input_schema: noInput,
  },
  {
    name: "flashcards",
    description: "Flashcards: cartões para revisar hoje, estados (novos, aprendizado, revisão), retenção em 30 dias e cartões por disciplina.",
    input_schema: noInput,
  },
  {
    name: "simulados",
    description: "Simulados: sem 'tentativaId', as 10 tentativas mais recentes com nota; com 'tentativaId', o resultado por disciplina e tópico, a maior perda de pontos e o tópico prioritário.",
    input_schema: {
      type: "object",
      properties: { tentativaId: { type: "string", description: "Id da tentativa retornado na lista." } },
      additionalProperties: false,
    },
  },
  {
    name: "sessoes_de_estudo",
    description: "Sessões de estudo concluídas no período: minutos por disciplina e lista com tipo, tópico, questões, acertos e foco.",
    input_schema: {
      type: "object",
      properties: { dias: { type: "integer", minimum: 1, maximum: 60, description: "Quantidade de dias até hoje. Padrão: 14." } },
      additionalProperties: false,
    },
  },
  {
    name: "banco_de_questoes",
    description: "Banco de questões da plataforma por disciplina: questões disponíveis, já respondidas e acerto nas últimas 52 semanas.",
    input_schema: {
      type: "object",
      properties: { disciplina: { type: "string", description: "Filtra por nome da disciplina." } },
      additionalProperties: false,
    },
  },
  {
    name: "propor_ajuste_rotina",
    description:
      "Cria uma SUGESTÃO de mudança na rotina para o estudante aceitar, editar ou ignorar. Não altera a rotina. Blocos novos não podem sobrepor blocos existentes: inclua em 'remover_blocos' os ids dos blocos que serão substituídos. Horários 'HH:MM'; um bloco que termina depois da meia-noite (ex.: sono 23:00 a 06:30) é dividido automaticamente. Se a validação falhar, o resultado explica o conflito para você corrigir.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto, por exemplo 'Incluir faculdade e treino na rotina'." },
        porque: { type: "string", description: "Explicação para o estudante com os dados ou a fala dele que justificam a mudança e as suposições feitas." },
        adicionar: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dias: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 }, description: "1 = segunda … 7 = domingo." },
              inicio: { type: "string", description: "HH:MM" },
              fim: { type: "string", description: "HH:MM" },
              categoria: { type: "string", enum: CATEGORY_KEYS, description: `Categoria: ${categoryHelp}.` },
              rotulo: { type: "string", description: "Rótulo opcional, por exemplo 'Academia'." },
              fixo: { type: "boolean", description: "Compromisso fixo (padrão true)." },
            },
            required: ["dias", "inicio", "fim", "categoria"],
            additionalProperties: false,
          },
        },
        remover_blocos: { type: "array", items: { type: "string" }, description: "Ids de blocos existentes (da ferramenta rotina) a remover." },
      },
      required: ["titulo", "porque"],
      additionalProperties: false,
    },
  },
  {
    name: "propor_ajuste_metas",
    description:
      "Cria uma SUGESTÃO de ajuste nas metas de estudo (meta semanal em horas, limite diário e duração máxima da sessão em minutos) para o estudante aceitar ou ignorar. Não altera nada sozinha. Informe só os campos que devem mudar.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        porque: { type: "string", description: "Justificativa com os dados que sustentam o ajuste." },
        horas_semanais: { type: "number", minimum: 1, maximum: 80 },
        limite_diario_minutos: { type: "integer", minimum: 30, maximum: 720 },
        sessao_maxima_minutos: { type: "integer", minimum: 20, maximum: 240 },
      },
      required: ["titulo", "porque"],
      additionalProperties: false,
    },
  },
  {
    name: "propor_redistribuicao",
    description:
      "Pede ao planejador novos horários, dentro da semana atual, para as sessões não realizadas, respeitando sono, compromissos fixos e o limite diário. Gera uma sugestão para o estudante decidir; só é aplicada sozinha se ele ativou ajustes menores automáticos (o resultado informa).",
    input_schema: noInput,
  },
];

const clock = z
  .string()
  .transform((v, c) => {
    const m = parseClock(v.trim());
    if (m === null) {
      c.addIssue({ code: "custom", message: `Horário inválido: ${v}. Use HH:MM.` });
      return z.NEVER;
    }
    return m;
  });

const schemas = {
  visao_geral: z.object({}).passthrough(),
  plano_de_estudos: z.object({
    semana: z.enum(["atual", "proxima"]).optional(),
    data: z.string().refine(isDateKey, "Use AAAA-MM-DD.").optional(),
  }),
  rotina: z.object({}).passthrough(),
  desempenho: z.object({ semanas: z.number().int().optional() }),
  edital: z.object({ concursoId: z.string().max(40).optional(), disciplina: z.string().max(80).optional() }),
  caderno_de_erros: z.object({}).passthrough(),
  flashcards: z.object({}).passthrough(),
  simulados: z.object({ tentativaId: z.string().max(40).optional() }),
  sessoes_de_estudo: z.object({ dias: z.number().int().min(1).max(60).optional() }),
  banco_de_questoes: z.object({ disciplina: z.string().max(80).optional() }),
  propor_ajuste_rotina: z.object({
    titulo: z.string().trim().min(3).max(80),
    porque: z.string().trim().min(10).max(1200),
    adicionar: z
      .array(
        z.object({
          dias: z.array(z.number().int().min(1).max(7)).min(1),
          inicio: clock,
          fim: clock,
          categoria: z.enum(CATEGORY_KEYS),
          rotulo: z.string().trim().max(60).optional(),
          fixo: z.boolean().optional(),
        }),
      )
      .max(20)
      .optional(),
    remover_blocos: z.array(z.string().max(40)).max(40).optional(),
  }),
  propor_ajuste_metas: z.object({
    titulo: z.string().trim().min(3).max(80),
    porque: z.string().trim().min(10).max(1200),
    horas_semanais: z.number().optional(),
    limite_diario_minutos: z.number().int().optional(),
    sessao_maxima_minutos: z.number().int().optional(),
  }),
  propor_redistribuicao: z.object({}).passthrough(),
} satisfies Record<string, z.ZodTypeAny>;

export type ToolName = keyof typeof schemas;

export interface ToolRunState {
  proposals: number;
  recommendationIds: string[];
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

function asText(value: unknown) {
  return JSON.stringify(value);
}

async function run(ctx: data.MentorContext, name: ToolName, input: unknown, state: ToolRunState): Promise<unknown> {
  switch (name) {
    case "visao_geral":
      return data.overview(ctx);
    case "plano_de_estudos":
      return data.studyPlan(ctx, schemas.plano_de_estudos.parse(input));
    case "rotina":
      return data.routine(ctx);
    case "desempenho":
      return data.performance(ctx, schemas.desempenho.parse(input));
    case "edital":
      return data.syllabus(ctx, schemas.edital.parse(input));
    case "caderno_de_erros":
      return data.errorNotebook(ctx);
    case "flashcards":
      return data.flashcards(ctx);
    case "simulados":
      return data.simulations(ctx, schemas.simulados.parse(input));
    case "sessoes_de_estudo":
      return data.studySessions(ctx, schemas.sessoes_de_estudo.parse(input));
    case "banco_de_questoes":
      return data.questionBank(ctx, schemas.banco_de_questoes.parse(input));
  }

  if (state.proposals >= MAX_PROPOSALS_PER_TURN) throw new DomainError(`Limite de ${MAX_PROPOSALS_PER_TURN} sugestões por resposta atingido.`);

  switch (name) {
    case "propor_ajuste_rotina": {
      const p = schemas.propor_ajuste_rotina.parse(input);
      const rec = await createRoutineProposal(
        ctx.userId,
        {
          title: p.titulo,
          reason: p.porque,
          evidence: { origem: "Vértice Mentor" },
          add: (p.adicionar ?? []).map((a) => ({ days: a.dias, startMinute: a.inicio, endMinute: a.fim, category: a.categoria, label: a.rotulo || null, isFixed: a.fixo ?? true })),
          removeBlockIds: p.remover_blocos ?? [],
        },
        "MENTOR",
      );
      state.proposals++;
      state.recommendationIds.push(rec.id);
      return { sugestaoCriada: true, id: rec.id, observacao: "A sugestão aparece abaixo da sua resposta para o estudante aceitar, editar ou ignorar. Nada foi alterado ainda." };
    }
    case "propor_ajuste_metas": {
      const p = schemas.propor_ajuste_metas.parse(input);
      const rec = await createGoalProposal(
        ctx.userId,
        {
          title: p.titulo,
          reason: p.porque,
          evidence: { origem: "Vértice Mentor" },
          values: { weeklyHoursTarget: p.horas_semanais, dailyStudyLimitMin: p.limite_diario_minutos, maxSessionMin: p.sessao_maxima_minutos },
        },
        "MENTOR",
      );
      state.proposals++;
      state.recommendationIds.push(rec.id);
      return { sugestaoCriada: true, id: rec.id, observacao: "A sugestão aparece abaixo da sua resposta para o estudante decidir. Nada foi alterado ainda." };
    }
    case "propor_redistribuicao": {
      const id = await proposeRedistribution(ctx.userId);
      const rec = await db.aiRecommendation.findFirst({ where: { id, userId: ctx.userId }, select: { status: true, title: true, reason: true, proposedChanges: true } });
      state.proposals++;
      state.recommendationIds.push(id);
      const moves = ((rec?.proposedChanges ?? {}) as { moves?: unknown[] }).moves?.length ?? 0;
      return {
        sugestaoCriada: true,
        id,
        sessoesComNovoHorario: moves,
        aplicadaAutomaticamente: rec?.status === "AUTO_APPLIED",
        porque: rec?.reason,
        observacao:
          rec?.status === "AUTO_APPLIED"
            ? "Aplicada automaticamente porque o estudante autorizou ajustes menores. Ele pode desfazer abaixo da resposta."
            : "A sugestão aparece abaixo da sua resposta para o estudante decidir. Nada foi alterado ainda.",
      };
    }
  }
}

export async function executeTool(ctx: data.MentorContext, name: string, input: unknown, state: ToolRunState): Promise<ToolOutcome> {
  if (!(name in schemas)) return { content: `Ferramenta desconhecida: ${name}.`, isError: true };
  try {
    return { content: asText(await run(ctx, name as ToolName, input ?? {}, state)), isError: false };
  } catch (err) {
    if (err instanceof z.ZodError) return { content: `Parâmetros inválidos: ${err.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ")}`, isError: true };
    if (err instanceof DomainError) return { content: err.message, isError: true };
    console.error(`[mentor] tool ${name} failed`, err);
    return { content: "Falha interna ao consultar os dados. Informe ao estudante que esta informação está indisponível no momento.", isError: true };
  }
}
