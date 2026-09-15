import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { formatClock, formatMinutes, formatPercent, plural } from "@/lib/format";
import { ERROR_REASON_LABEL, PLAN_ITEM_KIND_LABEL, PLAN_ITEM_STATUS_LABEL } from "@/lib/labels";
import { keyToDbDate, localNow, startOfWeek } from "@/lib/time";
import { getItemsForDay, getWeekPlanView } from "@/modules/plan/queries";
import { markMissedItems, proposeRedistribution } from "@/modules/plan/service";
import { planItemTitle } from "@/modules/plan/titles";
import { analyzeUserRoutine } from "@/modules/routine/service";
import { streakFor } from "@/modules/performance/metrics";
import { subjectAccuracy, weakestTopics } from "@/modules/performance/analytics";
import { errorAnalytics } from "@/modules/errors/service";
import type { MentorContext } from "./data";
import type { MentorAnalysisKey } from "./suggestions";

/*
 * Rule-based answers built only from stored data. They are labeled as
 * automatic analyses in the UI and never presented as AI output.
 */

export interface AnalysisResult {
  text: string;
  sources: string[];
  recommendationIds: string[];
}

const MIN_ANSWERS = 20;

async function todayPlan(ctx: MentorContext): Promise<AnalysisResult> {
  const tz = ctx.profile.timezone;
  const today = localNow(tz).key;
  await markMissedItems(ctx.userId, tz);
  const items = (await getItemsForDay(ctx.userId, tz, today)).filter((i) => i.status !== "CANCELED");
  if (items.length === 0) {
    const plan = await db.studyPlan.findUnique({ where: { userId_weekStart: { userId: ctx.userId, weekStart: keyToDbDate(startOfWeek(today)) } }, select: { id: true } });
    return {
      text: plan
        ? "Não há sessões planejadas para hoje. Veja a distribuição da semana em [Plano](/plano)."
        : "Você ainda não tem plano para esta semana. Gere o plano em [Plano](/plano) para ver o que estudar e o motivo de cada sessão.",
      sources: ["Plano"],
      recommendationIds: [],
    };
  }
  const lines = items.map(
    (i) => `- **${formatClock(i.startMinute)} às ${formatClock(i.endMinute)}, ${planItemTitle(i)}** (${PLAN_ITEM_KIND_LABEL[i.kind].toLowerCase()}, ${PLAN_ITEM_STATUS_LABEL[i.status].toLowerCase()}). ${i.reason}`,
  );
  return {
    text: `Hoje há ${plural(items.length, "sessão", "sessões")} no seu plano. Este é o motivo registrado pelo planejador em cada uma:\n\n${lines.join("\n")}`,
    sources: ["Plano"],
    recommendationIds: [],
  };
}

async function weakPoints(ctx: MentorContext): Promise<AnalysisResult> {
  const tz = ctx.profile.timezone;
  const [subjects, weakest, errors] = await Promise.all([subjectAccuracy(ctx.userId, tz, 8), weakestTopics(ctx.userId, 5), errorAnalytics(ctx.userId)]);
  const answered = subjects.reduce((a, s) => a + s.answered, 0);
  const correct = subjects.reduce((a, s) => a + s.correct, 0);
  const sources = ["Desempenho", "Caderno de erros"];

  if (answered < MIN_ANSWERS) {
    return {
      text: `Ainda não há dados suficientes para apontar onde você perde mais pontos. Nas últimas 8 semanas você respondeu ${plural(answered, "questão", "questões")}; a análise começa a partir de ${MIN_ANSWERS}. Resolva questões em [Questões](/questoes).`,
      sources,
      recommendationIds: [],
    };
  }

  const mean = correct / answered;
  const parts = [`Nas últimas 8 semanas, sua média é ${formatPercent(mean)} de acertos em ${plural(answered, "questão", "questões")}.`];
  const below = subjects.filter((s) => s.answered >= 10 && s.accuracy < mean).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4);
  parts.push(
    below.length
      ? `Disciplinas abaixo da sua média (com pelo menos 10 questões):\n\n${below.map((s) => `- **${s.name}**: ${formatPercent(s.accuracy)} em ${plural(s.answered, "questão", "questões")}`).join("\n")}`
      : "Nenhuma disciplina com pelo menos 10 questões está abaixo da sua média.",
  );
  if (weakest.length) {
    parts.push(
      `Tópicos com menor acerto no seu histórico (mínimo de 5 questões):\n\n${weakest
        .map((t) => `- **${t.name}** (${t.subjectName}): ${formatPercent(t.accuracy)} em ${plural(t.answered, "questão", "questões")}. [Treinar](/questoes?assunto=${t.id})`)
        .join("\n")}`,
    );
  }
  const top = errors.reasons[0];
  if (top && errors.classified >= 10) {
    parts.push(`No caderno de erros, ${formatPercent(top.share)} dos erros classificados foram “${ERROR_REASON_LABEL[top.reason]}” (${errors.classified} erros com motivo). Veja em [Caderno de erros](/caderno-de-erros).`);
  }
  return { text: parts.join("\n\n"), sources, recommendationIds: [] };
}

async function week(ctx: MentorContext): Promise<AnalysisResult> {
  const tz = ctx.profile.timezone;
  const [view, streak] = await Promise.all([getWeekPlanView(ctx.userId, tz, "current"), streakFor(ctx.userId, tz, localNow(tz).key)]);
  const sources = ["Plano", "Sessões de estudo"];
  if (!view.plan && view.plannedMinutes === 0) {
    return {
      text: `Você ainda não tem plano para esta semana, então não há como comparar planejado e realizado. Até agora você estudou ${formatMinutes(view.executedMinutes)}. Gere o plano em [Plano](/plano).`,
      sources,
      recommendationIds: [],
    };
  }

  const parts: string[] = [];
  if (view.plannedToDateMinutes > 0) {
    const rate = view.executedMinutes / view.plannedToDateMinutes;
    parts.push(
      `Até agora você estudou ${formatMinutes(view.executedMinutes)} de ${formatMinutes(view.plannedToDateMinutes)} previstos para as sessões que já passaram (${formatPercent(rate)}). A semana tem ${formatMinutes(view.plannedMinutes)} planejados no total.`,
    );
  } else {
    parts.push(`Ainda não havia sessões previstas até este momento. A semana tem ${formatMinutes(view.plannedMinutes)} planejados, e você já estudou ${formatMinutes(view.executedMinutes)}.`);
  }
  const behind = view.bySubject.filter((s) => s.plannedToDate - s.executed >= 30).sort((a, b) => b.plannedToDate - b.executed - (a.plannedToDate - a.executed)).slice(0, 4);
  if (behind.length) {
    parts.push(`Disciplinas abaixo do previsto até hoje:\n\n${behind.map((s) => `- **${s.name}**: ${formatMinutes(s.executed)} de ${formatMinutes(s.plannedToDate)}`).join("\n")}`);
  }
  if (view.missedCount > 0) {
    parts.push(`${plural(view.missedCount, "sessão não realizada continua", "sessões não realizadas continuam")} sem novo horário. Peça “Redistribua as sessões que perdi nesta semana.” para receber uma sugestão.`);
  }
  parts.push(streak > 0 ? `Você estuda há ${plural(streak, "dia seguido", "dias seguidos")}.` : "Sua sequência de dias com estudo está zerada.");
  return { text: parts.join("\n\n"), sources, recommendationIds: [] };
}

async function routineHealth(ctx: MentorContext): Promise<AnalysisResult> {
  const p = ctx.profile;
  const { blocks, analysis } = await analyzeUserRoutine(
    ctx.userId,
    { weeklyHoursTarget: p.weeklyHoursTarget, dailyStudyLimitMin: p.dailyStudyLimitMin, maxSessionMin: p.maxSessionMin, timezone: p.timezone },
    startOfWeek(localNow(p.timezone).key),
  );
  const sources = ["Rotina"];
  if (blocks.length === 0) {
    return { text: "Sua rotina ainda não tem blocos cadastrados, então a análise usa apenas os horários padrão. Cadastre sono, trabalho e compromissos em [Rotina](/rotina).", sources, recommendationIds: [] };
  }
  const sustainability = { GOOD: "boa", MODERATE: "moderada", LOW: "baixa" }[analysis.sustainability];
  const risk = { LOW: "baixo", MODERATE: "moderado", HIGH: "alto" }[analysis.overloadRisk];
  const parts = [
    `A sustentabilidade da sua rotina é ${sustainability} e o risco de sobrecarga é ${risk}. Ela deixa ${formatMinutes(analysis.capacityMinutes)} livres para estudo por semana, e a carga recomendada é ${formatMinutes(analysis.recommendedMinutes)}.`,
  ];
  if (analysis.recommendedBasis.length) parts.push(`A carga recomendada é o menor valor entre: ${analysis.recommendedBasis.join("; ")}.`);
  if (analysis.diagnostics.length) {
    parts.push(analysis.diagnostics.slice(0, 5).map((d) => `- **${d.title}**. ${d.detail}${d.suggestion ? ` ${d.suggestion}` : ""}`).join("\n"));
  }
  parts.push("Ajuste os blocos em [Rotina](/rotina).");
  return { text: parts.join("\n\n"), sources, recommendationIds: [] };
}

async function redistribute(ctx: MentorContext): Promise<AnalysisResult> {
  const sources = ["Plano", "Redistribuição"];
  try {
    const id = await proposeRedistribution(ctx.userId);
    const rec = await db.aiRecommendation.findFirst({ where: { id, userId: ctx.userId }, select: { status: true, reason: true, proposedChanges: true } });
    const moves = ((rec?.proposedChanges ?? {}) as { moves?: unknown[] }).moves?.length ?? 0;
    const text =
      rec?.status === "AUTO_APPLIED"
        ? `${rec.reason} Como você autorizou ajustes menores automáticos, as sessões já foram reagendadas; é possível desfazer abaixo.`
        : moves === 0
          ? `${rec?.reason ?? ""} Não há horários livres suficientes nesta semana.`.trim()
          : `${rec?.reason ?? ""} A sugestão está abaixo para você aceitar, escolher parte das mudanças ou ignorar.`.trim();
    return { text, sources, recommendationIds: [id] };
  } catch (err) {
    if (err instanceof DomainError) return { text: err.message, sources, recommendationIds: [] };
    throw err;
  }
}

export async function runAnalysis(ctx: MentorContext, key: MentorAnalysisKey): Promise<AnalysisResult> {
  switch (key) {
    case "plano_hoje":
      return todayPlan(ctx);
    case "pontos_fracos":
      return weakPoints(ctx);
    case "semana":
      return week(ctx);
    case "rotina":
      return routineHealth(ctx);
    case "redistribuir":
      return redistribute(ctx);
  }
}
