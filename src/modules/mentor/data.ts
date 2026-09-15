import "server-only";
import type { Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { formatClock, weekdayName } from "@/lib/format";
import {
  COMPETITION_STATUS_LABEL,
  ENERGY_LABEL,
  ERROR_REASON_LABEL,
  PLAN_ITEM_KIND_LABEL,
  PLAN_ITEM_STATUS_LABEL,
  ROUTINE_CATEGORY_LABEL,
  SLOT_CLASS_LABEL,
  TOPIC_STATUS_LABEL,
} from "@/lib/labels";
import { addDays, daysUntilDate, dbDateToKey, isoWeekdayOfKey, localNow, startOfWeek, toDateKey, zonedToUtc } from "@/lib/time";
import { competitionTitle, getEnrollments } from "@/modules/competitions/queries";
import { getItemsForDay, getWeekPlanView, type PlanItemView } from "@/modules/plan/queries";
import { markMissedItems } from "@/modules/plan/service";
import { analyzeUserRoutine } from "@/modules/routine/service";
import { readinessFor, streakFor } from "@/modules/performance/metrics";
import { buildInsights, readinessHistory, simulationSeries, subjectAccuracy, weakestTopics, weeklySeries } from "@/modules/performance/analytics";
import { getEditalTree, type TopicNode } from "@/modules/syllabus/queries";
import { errorAnalytics } from "@/modules/errors/service";
import { flashcardStats } from "@/modules/flashcards/service";
import { getAttemptResult } from "@/modules/simulations/service";

/*
 * Read-only views of the student's data for the Mentor. Every query is scoped
 * by userId. Values the platform cannot confirm are spelled out as
 * NOT_VERIFIED so the model can repeat them instead of guessing.
 */

export const NOT_VERIFIED = "Informação não verificada";

export interface MentorContext {
  userId: string;
  firstName: string;
  profile: Profile;
}

/** Confirmed values pass through; student-provided ones say so; anything else is not verified. */
function checked<T>(value: T | null | undefined, verification: "VERIFIED" | "UNVERIFIED" | "USER_PROVIDED") {
  if (value === null || value === undefined) return NOT_VERIFIED;
  if (verification === "VERIFIED") return value;
  if (verification === "USER_PROVIDED") return { valor: value, origem: "informado pelo estudante" };
  return NOT_VERIFIED;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100));
const localDate = (d: Date | null | undefined, tz: string) => (d ? toDateKey(d, tz) : null);
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Week views omit the per-factor breakdown (already summarized in "porque") to keep tool results small. */
function itemForMentor(i: PlanItemView, detailed = false) {
  return {
    id: i.id,
    data: i.dateKey,
    inicio: formatClock(i.startMinute),
    fim: formatClock(i.endMinute),
    tipo: PLAN_ITEM_KIND_LABEL[i.kind],
    disciplina: i.subjectName,
    topico: i.topicName,
    ...(detailed ? { topicoPai: i.parentTopicName, fatores: i.reasons.map((r) => r.text) } : {}),
    status: PLAN_ITEM_STATUS_LABEL[i.status],
    horario: SLOT_CLASS_LABEL[i.slotClass],
    porque: i.reason,
    acertoNoTopicoPercent: pct(i.accuracy),
    ...(i.rescheduledFrom ? { reagendadaDe: `${i.rescheduledFrom.dateKey} ${formatClock(i.rescheduledFrom.startMinute)}` } : {}),
  };
}

export async function overview(ctx: MentorContext) {
  const tz = ctx.profile.timezone;
  const local = localNow(tz);
  const [enrollments, streak, week, pendingRecs, errorsOpen] = await Promise.all([
    getEnrollments(ctx.userId),
    streakFor(ctx.userId, tz, local.key),
    getWeekPlanView(ctx.userId, tz, "current"),
    db.aiRecommendation.count({ where: { userId: ctx.userId, status: "PENDING" } }),
    db.errorEntry.count({ where: { userId: ctx.userId, resolvedAt: null } }),
  ]);
  const primary = enrollments.find((e) => e.isPrimary) ?? enrollments[0];
  const readiness = primary ? await readinessFor(ctx.userId, { id: primary.competitionId, name: primary.competition.name }, tz, local.key) : null;
  const [cards, topicReviewsDue] = await Promise.all([
    flashcardStats(ctx.userId, tz),
    db.topicProgress.count({ where: { userId: ctx.userId, nextReviewAt: { lt: zonedToUtc(addDays(local.key, 1), 0, tz) } } }),
  ]);

  return {
    hoje: { data: local.key, diaDaSemana: weekdayName(isoWeekdayOfKey(local.key)), hora: formatClock(local.minute), fuso: tz },
    preferencias: {
      objetivo: ctx.profile.goal,
      trilha: ctx.profile.track === "MILITARY" ? "Militar" : ctx.profile.track === "BOTH" ? "Pública e militar" : "Pública",
      trabalha: ctx.profile.works,
      fazFaculdade: ctx.profile.studiesCollege,
      preparacaoFisica: ctx.profile.physicalPrep,
      metaSemanalHoras: ctx.profile.weeklyHoursTarget,
      limiteDiarioMinutos: ctx.profile.dailyStudyLimitMin,
      sessaoMaximaMinutos: ctx.profile.maxSessionMin,
      pausaMinimaMinutos: ctx.profile.minBreakMin,
      ajustesMenoresAutomaticos: ctx.profile.autoApplyMinorChanges,
    },
    concursos: enrollments.map((e) => {
      const official = e.competition.examDate;
      const examDate = official ?? e.customExamDate;
      return {
        id: e.competitionId,
        nome: competitionTitle(e.competition, examDate),
        principal: e.isPrimary,
        tipo: e.competition.kind === "MILITARY" ? "Militar" : "Público",
        situacao: e.status === "ACTIVE" ? "Ativo" : "Pausado",
        statusDoConcurso: checked(COMPETITION_STATUS_LABEL[e.competition.status], e.competition.verification),
        banca: checked(e.competition.examBoard?.name, e.competition.verification),
        dataDaProva: official
          ? checked(dbDateToKey(official), e.competition.verification)
          : e.customExamDate
            ? { data: dbDateToKey(e.customExamDate), origem: "data informada pelo estudante (não oficial)" }
            : NOT_VERIFIED,
        diasAteAProva: examDate ? daysUntilDate(examDate, tz) : null,
        edital: e.competition.verification === "VERIFIED" ? "verificado" : e.competition.verification === "USER_PROVIDED" ? "informado pelo estudante" : NOT_VERIFIED,
        notaDeCorte: NOT_VERIFIED,
      };
    }),
    indiceDePreparacao: readiness
      ? {
          concurso: primary!.competition.name,
          valor: readiness.readiness.value,
          semValorPorque: readiness.readiness.insufficientReason,
          componentes: readiness.readiness.components.map((c) => ({ nome: c.label, peso: c.weight, valor: c.value === null ? null : Math.round(c.value * 100), nota: c.note })),
          forcas: readiness.readiness.strengths,
          lacunas: readiness.readiness.gaps,
          editalEstudadoPercent: pct(readiness.coverage.coverage),
          observacao: "Estimativa interna de 0 a 100 sobre a preparação. Não é probabilidade de aprovação.",
        }
      : null,
    semanaAtual: {
      inicio: week.weekStart,
      temPlano: !!week.plan,
      planejadoMinutos: week.plannedMinutes,
      planejadoAteAgoraMinutos: week.plannedToDateMinutes,
      executadoMinutos: week.executedMinutes,
      sessoesNaoRealizadasSemReagendar: week.missedCount,
    },
    diasSeguidosEstudando: streak,
    pendencias: {
      flashcardsParaHoje: cards.dueToday,
      revisoesDeTopicoVencidas: topicReviewsDue,
      errosEmAberto: errorsOpen,
      recomendacoesAguardandoDecisao: pendingRecs,
    },
  };
}

export async function studyPlan(ctx: MentorContext, input: { semana?: "atual" | "proxima"; data?: string }) {
  const tz = ctx.profile.timezone;
  await markMissedItems(ctx.userId, tz);
  if (input.data) {
    const items = await getItemsForDay(ctx.userId, tz, input.data);
    return { data: input.data, diaDaSemana: weekdayName(isoWeekdayOfKey(input.data)), sessoes: items.map((i) => itemForMentor(i, true)) };
  }
  const view = await getWeekPlanView(ctx.userId, tz, input.semana === "proxima" ? "next" : "current");
  if (!view.plan && view.days.every((d) => d.items.length === 0)) {
    return { semanaInicio: view.weekStart, temPlano: false, observacao: "Não há plano gerado para esta semana. O estudante pode gerar em /plano." };
  }
  return {
    semanaInicio: view.weekStart,
    temPlano: true,
    versaoDoPlano: view.plan?.version ?? null,
    recomendadoMinutos: view.plan?.recommendedMinutes ?? null,
    planejadoMinutos: view.plannedMinutes,
    planejadoAteAgoraMinutos: view.plannedToDateMinutes,
    executadoMinutos: view.executedMinutes,
    porDisciplina: view.bySubject.map((s) => ({ disciplina: s.name, planejadoMinutos: s.planned, planejadoAteAgoraMinutos: s.plannedToDate, executadoMinutos: s.executed })),
    sessoesNaoRealizadasSemReagendar: view.missedCount,
    redistribuicaoPendente: view.pendingRecommendation ? { titulo: view.pendingRecommendation.title, porque: view.pendingRecommendation.reason } : null,
    avisosDoPlanejador: (view.plan?.diagnostics.diagnostics ?? []).map((d) => `${d.title}: ${d.detail}`),
    dias: view.days.map((d) => ({ data: d.key, diaDaSemana: weekdayName(isoWeekdayOfKey(d.key)), executadoMinutos: d.executedMinutes, sessoes: d.items.map((i) => itemForMentor(i)) })),
  };
}

export async function routine(ctx: MentorContext) {
  const p = ctx.profile;
  const { routine: r, energy, history, analysis } = await analyzeUserRoutine(
    ctx.userId,
    { weeklyHoursTarget: p.weeklyHoursTarget, dailyStudyLimitMin: p.dailyStudyLimitMin, maxSessionMin: p.maxSessionMin, timezone: p.timezone },
    startOfWeek(localNow(p.timezone).key),
  );
  const blocks = r?.blocks ?? [];
  const learned = await db.energyPeriod.findMany({ where: { userId: ctx.userId }, select: { period: true, learnedDelta: true, learnedEvidence: true } });
  return {
    observacao: "dias: 1 = segunda … 7 = domingo. Horários fora de blocos contam como livres entre 06:00 e 23:30.",
    dias: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dia: d,
      nome: weekdayName(d),
      blocos: blocks
        .filter((b) => b.dayOfWeek === d)
        .map((b) => ({
          id: b.id,
          inicio: formatClock(b.startMinute),
          fim: formatClock(b.endMinute === 1440 ? 0 : b.endMinute),
          categoria: b.category,
          categoriaNome: ROUTINE_CATEGORY_LABEL[b.category],
          rotulo: b.label,
          fixo: b.isFixed,
          energia: b.energy ? ENERGY_LABEL[b.energy] : null,
        })),
      capacidadeDeEstudoMinutos: analysis.capacityByDay[d - 1] ?? 0,
    })),
    energiaPorPeriodo: energy.map((e) => {
      const l = learned.find((x) => x.period === e.period);
      return {
        periodo: e.period,
        nivelInformado: ENERGY_LABEL[e.level],
        ajusteAprendido: p.energyLearning ? (l?.learnedDelta ?? 0) : null,
        motivoDoAjuste: p.energyLearning ? (((l?.learnedEvidence ?? {}) as { reason?: string | null }).reason ?? null) : null,
      };
    }),
    aprendizadoDeEnergiaAtivo: p.energyLearning,
    analise: {
      capacidadeSemanalMinutos: analysis.capacityMinutes,
      minutosPorClasseDeHorario: { A: analysis.classMinutes.A, B: analysis.classMinutes.B, C: analysis.classMinutes.C },
      metaSemanalMinutos: analysis.targetMinutes,
      cargaRecomendadaMinutos: analysis.recommendedMinutes,
      baseDaRecomendacao: analysis.recommendedBasis,
      sustentabilidade: { GOOD: "boa", MODERATE: "moderada", LOW: "baixa" }[analysis.sustainability],
      riscoDeSobrecarga: { LOW: "baixo", MODERATE: "moderado", HIGH: "alto" }[analysis.overloadRisk],
      consistenciaRecentePercent: pct(analysis.consistency),
      diagnosticos: analysis.diagnostics.map((d) => ({ gravidade: d.severity, titulo: d.title, detalhe: d.detail, sugestao: d.suggestion ?? null })),
    },
    historicoSemanas: history.map((h) => ({ semana: h.weekStart, planejadoMinutos: h.plannedMinutes, executadoMinutos: h.executedMinutes })),
  };
}

export async function performance(ctx: MentorContext, input: { semanas?: number }) {
  const tz = ctx.profile.timezone;
  const weeks = input.semanas === 4 || input.semanas === 12 ? input.semanas : 8;
  const enrollments = await getEnrollments(ctx.userId);
  const primary = enrollments.find((e) => e.isPrimary) ?? enrollments[0];
  const [series, subjects, weakest, sims, history] = await Promise.all([
    weeklySeries(ctx.userId, tz, weeks),
    subjectAccuracy(ctx.userId, tz, weeks),
    weakestTopics(ctx.userId, 8),
    simulationSeries(ctx.userId),
    readinessHistory(ctx.userId, primary?.competitionId ?? null),
  ]);
  const insights = await buildInsights(ctx.userId, tz, series);
  const answered = subjects.reduce((a, s) => a + s.answered, 0);
  const correct = subjects.reduce((a, s) => a + s.correct, 0);
  const first = history[0];
  const last = history.at(-1);

  return {
    periodoSemanas: weeks,
    geral: { questoes: answered, acertos: correct, acertoPercent: answered ? pct(correct / answered) : null },
    semanas: series.map((w) => ({
      semana: w.weekStart,
      questoes: w.answered,
      acertoPercent: pct(w.accuracy),
      estudadoMinutos: w.executedMinutes,
      planejadoMinutos: w.plannedMinutes,
    })),
    observacaoSemanas: "acertoPercent fica nulo em semanas com menos de 10 questões.",
    porDisciplina: subjects.map((s) => ({ disciplina: s.name, questoes: s.answered, acertoPercent: pct(s.accuracy) })),
    topicosMaisFracos: weakest.map((t) => ({ topico: t.name, disciplina: t.subjectName, questoes: t.answered, acertoPercent: pct(t.accuracy), proximaRevisao: localDate(t.nextReviewAt, tz) })),
    observacaoTopicos: "Somente tópicos com pelo menos 5 questões respondidas (histórico completo).",
    simuladosRecentes: sims.slice(-8).map((s) => ({ titulo: s.simulation.title, data: localDate(s.finishedAt, tz), notaPercent: pct(s.score), certas: s.correct, erradas: s.wrong, emBranco: s.unanswered })),
    historicoDoIndice: history.length
      ? {
          concurso: primary?.competition.name ?? null,
          primeiro: first ? { data: first.dateKey, valor: Math.round(first.readiness) } : null,
          ultimo: last ? { data: last.dateKey, valor: Math.round(last.readiness) } : null,
          pontosRecentes: history.slice(-10).map((h) => ({ data: h.dateKey, valor: Math.round(h.readiness) })),
        }
      : null,
    observacoesCalculadas: insights.map((i) => i.text),
  };
}

function flattenLeaves(nodes: TopicNode[], parent: string | null, out: { node: TopicNode; parent: string | null }[] = []) {
  for (const n of nodes) {
    if (n.isLeaf) out.push({ node: n, parent });
    else flattenLeaves(n.children, n.name, out);
  }
  return out;
}

export async function syllabus(ctx: MentorContext, input: { concursoId?: string; disciplina?: string }) {
  const tz = ctx.profile.timezone;
  const enrollments = await getEnrollments(ctx.userId);
  if (enrollments.length === 0) return { observacao: "O estudante não tem concursos na lista. Ele pode adicionar em /concursos." };
  const chosen = input.concursoId ? enrollments.find((e) => e.competitionId === input.concursoId) : (enrollments.find((e) => e.isPrimary) ?? enrollments[0]);
  if (!chosen) throw new DomainError("Concurso não encontrado na lista do estudante. Use um id retornado por visao_geral.");
  const tree = await getEditalTree(ctx.userId, chosen.competitionId);
  if (!tree) throw new DomainError("Edital não encontrado.");

  const header = {
    concurso: tree.competition.name,
    concursoId: tree.competition.id,
    verificacao: tree.competition.verification === "VERIFIED" ? "verificado" : tree.competition.verification === "USER_PROVIDED" ? "informado pelo estudante" : NOT_VERIFIED,
    fonte: tree.competition.sourceNote,
    personalizadoPeloEstudante: tree.competition.editable,
    editalEstudadoPercent: pct(tree.coverage),
  };

  if (!input.disciplina) {
    return {
      ...header,
      disciplinas: tree.subjects.map((s) => ({
        disciplina: s.name,
        peso: checked(s.weight, s.verification),
        numeroDeQuestoesNaProva: checked(s.questionCount, s.verification),
        coberturaPercent: pct(s.coverage),
        topicos: s.leafCount,
        topicosEstudados: s.studiedCount,
        questoesRespondidas: s.answered,
        acertoPercent: s.answered >= 10 ? pct(s.correct / s.answered) : null,
      })),
      observacao: "Para ver os tópicos de uma disciplina, chame edital com o nome da disciplina.",
    };
  }

  const wanted = normalize(input.disciplina);
  const subject = tree.subjects.find((s) => normalize(s.name) === wanted) ?? tree.subjects.find((s) => normalize(s.name).includes(wanted));
  if (!subject) throw new DomainError(`Disciplina não encontrada neste edital. Disponíveis: ${tree.subjects.map((s) => s.name).join(", ")}.`);
  const leaves = flattenLeaves(subject.topics, null);
  return {
    ...header,
    disciplina: subject.name,
    peso: checked(subject.weight, subject.verification),
    coberturaPercent: pct(subject.coverage),
    topicos: leaves.map(({ node, parent }) => ({
      topico: node.name,
      dentroDe: parent,
      status: TOPIC_STATUS_LABEL[node.status],
      questoes: node.answered,
      acertoPercent: pct(node.accuracy),
      estudadoMinutos: node.studiedMinutes,
      erros: node.errors,
      flashcards: node.flashcards,
      ultimaRevisao: localDate(node.lastReviewedAt, tz),
      proximaRevisao: localDate(node.nextReviewAt, tz),
    })),
  };
}

export async function errorNotebook(ctx: MentorContext) {
  const tz = ctx.profile.timezone;
  const [analytics, recent] = await Promise.all([
    errorAnalytics(ctx.userId),
    db.errorEntry.findMany({
      where: { userId: ctx.userId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        createdAt: true,
        reason: true,
        selectedLabel: true,
        correctLabel: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
        question: { select: { statement: true } },
      },
    }),
  ]);
  return {
    total: analytics.total,
    emAberto: analytics.open,
    ultimos30Dias: analytics.recent30,
    motivos: analytics.reasons.map((r) => ({ motivo: ERROR_REASON_LABEL[r.reason], erros: r.count, participacaoPercent: pct(r.share) })),
    semMotivoClassificado: analytics.unclassified,
    topicosComMaisErros90Dias: analytics.topTopics.map((t) => ({ topico: t.name, disciplina: t.subjectName, erros: t.errors, acertoNoTopicoPercent: pct(t.accuracy) })),
    disciplinasComMaisErros90Dias: analytics.bySubject.map((s) => ({ disciplina: s.name, erros: s.count })),
    errosRecentesEmAberto: recent.map((e) => ({
      data: localDate(e.createdAt, tz),
      disciplina: e.subject?.name ?? null,
      topico: e.topic?.name ?? null,
      motivo: e.reason ? ERROR_REASON_LABEL[e.reason] : null,
      marcada: e.selectedLabel,
      correta: e.correctLabel,
      enunciadoInicio: e.question?.statement ? e.question.statement.slice(0, 180) : null,
    })),
  };
}

export async function flashcards(ctx: MentorContext) {
  const stats = await flashcardStats(ctx.userId, ctx.profile.timezone);
  const bySubject = await db.flashcard.groupBy({ by: ["subjectId"], where: { userId: ctx.userId, suspended: false }, _count: { _all: true } });
  const names = await db.subject.findMany({ where: { id: { in: bySubject.map((s) => s.subjectId).filter((id): id is string => !!id) } }, select: { id: true, name: true } });
  return {
    total: stats.total,
    paraRevisarHoje: stats.dueToday,
    observacaoHoje: "Inclui no máximo 20 cartões novos por dia.",
    novos: stats.fresh,
    emAprendizado: stats.learning,
    emRevisao: stats.review,
    suspensos: stats.suspended,
    revisadosHoje: stats.reviewedToday,
    retencao30DiasPercent: pct(stats.retention),
    amostraRetencao: stats.retentionSample,
    porDisciplina: bySubject.map((s) => ({ disciplina: names.find((n) => n.id === s.subjectId)?.name ?? "Sem disciplina", cartoes: s._count._all })),
  };
}

export async function simulations(ctx: MentorContext, input: { tentativaId?: string }) {
  const tz = ctx.profile.timezone;
  if (input.tentativaId) {
    const result = await getAttemptResult(ctx.userId, input.tentativaId);
    if (!result) throw new DomainError("Tentativa não encontrada ou ainda não finalizada.");
    const { attempt, subjects, topics, biggestLoss, priorityTopic } = result;
    return {
      titulo: attempt.simulation.title,
      finalizado: localDate(attempt.finishedAt, tz),
      tempoEsgotado: attempt.status === "EXPIRED",
      notaPercent: pct(attempt.score),
      certas: attempt.correct,
      erradas: attempt.wrong,
      emBranco: attempt.unanswered,
      duracaoMinutos: attempt.durationSec ? Math.round(attempt.durationSec / 60) : null,
      porDisciplina: subjects.map((s) => ({ disciplina: s.name, questoes: s.total, certas: s.correct, acertoPercent: pct(s.accuracy) })),
      porTopico: topics.map((t) => ({ topico: t.name, disciplina: t.subjectName, questoes: t.total, certas: t.correct })),
      maiorPerda: biggestLoss ? { disciplina: biggestLoss.name, perdidas: biggestLoss.lost, consideraPeso: biggestLoss.weighted } : null,
      topicoPrioritario: priorityTopic ? { topico: priorityTopic.name, disciplina: priorityTopic.subjectName, erros: priorityTopic.wrong } : null,
    };
  }
  const attempts = await db.simulationAttempt.findMany({
    where: { userId: ctx.userId },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { id: true, status: true, score: true, correct: true, wrong: true, unanswered: true, startedAt: true, finishedAt: true, simulation: { select: { title: true, _count: { select: { questions: true } } } } },
  });
  return {
    tentativas: attempts.map((a) => ({
      id: a.id,
      titulo: a.simulation.title,
      questoes: a.simulation._count.questions,
      situacao: a.status === "IN_PROGRESS" ? "em andamento" : a.status === "EXPIRED" ? "tempo esgotado" : "finalizado",
      data: localDate(a.finishedAt ?? a.startedAt, tz),
      notaPercent: a.status === "IN_PROGRESS" ? null : pct(a.score),
      certas: a.correct,
      erradas: a.wrong,
      emBranco: a.unanswered,
    })),
    observacao: attempts.length ? "Para detalhes por disciplina e tópico, chame simulados com tentativaId." : "Nenhum simulado feito ainda. O estudante pode criar em /simulados/novo.",
  };
}

export async function studySessions(ctx: MentorContext, input: { dias?: number }) {
  const tz = ctx.profile.timezone;
  const days = Math.min(60, Math.max(1, Math.round(input.dias ?? 14)));
  const today = localNow(tz).key;
  const since = zonedToUtc(addDays(today, -(days - 1)), 0, tz);
  const rows = await db.studySession.findMany({
    where: { userId: ctx.userId, status: "COMPLETED", startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    take: 120,
    select: { startedAt: true, effectiveSeconds: true, kind: true, isManual: true, focus: true, questionsCount: true, questionsCorrect: true, planItemId: true, subject: { select: { name: true } }, topic: { select: { name: true } } },
  });
  const bySubject = new Map<string, number>();
  for (const r of rows) bySubject.set(r.subject?.name ?? "Sem disciplina", (bySubject.get(r.subject?.name ?? "Sem disciplina") ?? 0) + r.effectiveSeconds / 60);
  return {
    periodoDias: days,
    totalMinutos: Math.round(rows.reduce((a, r) => a + r.effectiveSeconds / 60, 0)),
    sessoes: rows.length,
    porDisciplinaMinutos: [...bySubject.entries()].map(([disciplina, m]) => ({ disciplina, minutos: Math.round(m) })).sort((a, b) => b.minutos - a.minutos),
    lista: rows.slice(0, 40).map((r) => ({
      data: toDateKey(r.startedAt, tz),
      tipo: PLAN_ITEM_KIND_LABEL[r.kind],
      disciplina: r.subject?.name ?? null,
      topico: r.topic?.name ?? null,
      minutos: Math.round(r.effectiveSeconds / 60),
      questoes: r.questionsCount,
      acertos: r.questionsCorrect,
      foco1a5: r.focus,
      doPlano: !!r.planItemId,
      registroManual: r.isManual,
    })),
  };
}

export async function questionBank(ctx: MentorContext, input: { disciplina?: string }) {
  const visible = { OR: [{ ownerId: null }, { ownerId: ctx.userId }] };
  const subjects = await db.subject.findMany({ where: visible, select: { id: true, name: true } });
  const wanted = input.disciplina ? normalize(input.disciplina) : null;
  const chosen = wanted ? subjects.filter((s) => normalize(s.name).includes(wanted)) : subjects;
  if (wanted && chosen.length === 0) throw new DomainError("Disciplina não encontrada no banco de questões.");
  const ids = chosen.map((s) => s.id);
  const [available, answered, stats] = await Promise.all([
    db.question.groupBy({ by: ["subjectId"], where: { ...visible, subjectId: { in: ids } }, _count: { _all: true } }),
    db.$queryRaw<{ subjectId: string; seen: bigint; lastCorrect: bigint }[]>`
      SELECT q."subjectId", COUNT(*) AS seen, COUNT(*) FILTER (WHERE s."lastCorrect") AS "lastCorrect"
        FROM "UserQuestionState" s JOIN "Question" q ON q.id = s."questionId"
       WHERE s."userId" = ${ctx.userId} AND s.attempts > 0 GROUP BY q."subjectId"`,
    subjectAccuracy(ctx.userId, ctx.profile.timezone, 52),
  ]);
  return {
    observacao: "Questões autorais da plataforma e questões cadastradas pelo estudante. Acerto considera as últimas 52 semanas.",
    porDisciplina: chosen
      .map((s) => {
        const seen = answered.find((a) => a.subjectId === s.id);
        const st = stats.find((x) => x.subjectId === s.id);
        return {
          disciplina: s.name,
          disponiveis: available.find((a) => a.subjectId === s.id)?._count._all ?? 0,
          jaRespondidas: Number(seen?.seen ?? 0),
          acertouNaUltimaTentativa: Number(seen?.lastCorrect ?? 0),
          tentativas: st?.answered ?? 0,
          acertoPercent: st && st.answered >= 10 ? pct(st.accuracy) : null,
        };
      })
      .filter((s) => s.disponiveis > 0 || s.tentativas > 0)
      .sort((a, b) => b.tentativas - a.tentativas),
  };
}

