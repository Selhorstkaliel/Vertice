"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";
import { DEADLINE_GRACE_MS, finalizeAttempt, selectQuestions } from "./service";
import { examModeMinutes } from "@/engines/simulations/scoring";
import { officialQuestionCount, ruleForCompetition } from "@/modules/scoring/service";
import { getDiagnosticOffer } from "./diagnostic";
import { drawRealExamPart, realExamPlan } from "./real-exam";

function revalidateSimulations() {
  for (const p of ["/simulados", "/desempenho", "/painel", "/caderno-de-erros", "/edital", "/questoes"]) revalidatePath(p);
}

const createSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome ao simulado.").max(80),
  competitionId: z.string().optional(),
  examBoardId: z.string().optional(),
  subjectIds: z.array(z.string()).min(1, "Escolha pelo menos uma matéria."),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  questionCount: z.number().int().min(3, "Mínimo de 3 questões.").max(120, "Máximo de 120 questões."),
  timeLimitMinutes: z.number().int().min(5, "Mínimo de 5 minutos.").max(600, "Máximo de 10 horas.").nullable(),
  preferUnanswered: z.boolean(),
  /** Official time and question count, scored by the competition rule. */
  examMode: z.boolean().optional(),
});

export type SimulationInput = z.input<typeof createSchema>;

async function startAttempt(userId: string, simulationId: string, timeLimitMinutes: number | null) {
  const now = new Date();
  return db.simulationAttempt.create({
    data: {
      simulationId,
      userId,
      startedAt: now,
      deadlineAt: timeLimitMinutes ? new Date(now.getTime() + timeLimitMinutes * 60_000) : null,
    },
    select: { id: true },
  });
}

export async function createSimulationAction(input: SimulationInput): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;

  const visible = { OR: [{ ownerId: null }, { ownerId: user.id }] };
  const subjects = await db.subject.findMany({ where: { id: { in: d.subjectIds }, ...visible }, select: { id: true } });
  if (subjects.length !== d.subjectIds.length) return fail("Matéria inválida.");
  if (d.competitionId && !(await db.competition.findFirst({ where: { id: d.competitionId, ...visible }, select: { id: true } }))) return fail("Concurso inválido.");
  if (d.examBoardId && !(await db.examBoard.findUnique({ where: { id: d.examBoardId }, select: { id: true } }))) return fail("Banca inválida.");

  const rule = d.competitionId ? await ruleForCompetition(d.competitionId) : null;
  let count = d.questionCount;
  let quotas: Record<string, number> | undefined;
  let official: number | null = null;
  if (d.examMode) {
    if (!d.competitionId) return fail("O modo prova precisa de um concurso.");
    const edital = await db.competitionSubject.findMany({ where: { competitionId: d.competitionId }, select: { subjectId: true, questionCount: true } });
    official = officialQuestionCount(rule, edital.map((e) => e.questionCount));
    if (official) {
      count = Math.min(120, official);
      const scale = count / official;
      const perSubject = rule?.subjects.length && rule.subjects.every((s) => s.questions) ? rule.subjects.map((s) => [s.subjectId, s.questions!] as const) : edital.map((e) => [e.subjectId, e.questionCount ?? 0] as const);
      quotas = Object.fromEntries(perSubject.filter(([id]) => d.subjectIds.includes(id)).map(([id, n]) => [id, Math.round(n * scale)]));
    }
    if (!rule?.durationMinutes && !d.timeLimitMinutes) return fail("Sem o tempo oficial cadastrado, informe o tempo do simulado.");
  }

  const { questionIds, available } = await selectQuestions(user.id, {
    competitionId: d.competitionId,
    examBoardId: d.examBoardId,
    subjectIds: d.subjectIds,
    difficulty: d.difficulty,
    count,
    preferUnanswered: d.preferUnanswered,
    quotas,
  });
  if (questionIds.length < 3) {
    return fail(
      available === 0
        ? "Não há questões com esses filtros. Amplie as matérias ou remova banca e dificuldade."
        : `Só há ${available} ${available === 1 ? "questão" : "questões"} com esses filtros; o mínimo é 3.`,
    );
  }

  // Exam mode: the official time, scaled when the bank has fewer questions than the real exam.
  const timeLimitMinutes = d.examMode && rule?.durationMinutes ? examModeMinutes(rule.durationMinutes, official, questionIds.length) : d.timeLimitMinutes;

  const simulation = await db.simulation.create({
    data: {
      userId: user.id,
      title: d.title,
      competitionId: d.competitionId || null,
      examBoardId: d.examBoardId || null,
      difficulty: d.difficulty,
      questionCount: questionIds.length,
      timeLimitMinutes,
      examMode: !!d.examMode,
      scoringRuleId: rule?.id ?? null,
      subjects: { create: d.subjectIds.map((subjectId) => ({ subjectId })) },
      questions: { create: questionIds.map((questionId, order) => ({ questionId, order })) },
    },
    select: { id: true },
  });
  const attempt = await startAttempt(user.id, simulation.id, timeLimitMinutes);
  revalidateSimulations();
  redirect(`/simulados/tentativa/${attempt.id}`);
}

/** "Simulado da prova real": one part (day) of the competition's real exam, built from its blueprint. */
export async function startRealExamAction(competitionId: string, partKey: string): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const id = z.string().min(1).max(40).safeParse(competitionId);
  if (!id.success) return fail("Concurso inválido.");
  if (!(await db.competition.findFirst({ where: { id: id.data, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true } }))) return fail("Concurso inválido.");
  const plan = await realExamPlan(id.data);
  const part = plan?.parts.find((p) => p.key === partKey);
  if (!plan || !part) return fail("Ainda não há uma prova oficial deste concurso no banco para montar o simulado.");

  const questionIds = await drawRealExamPart(user.id, plan.catalogId, part);
  if (questionIds.length < 3) return fail("Não há questões suficientes deste concurso no banco ainda.");
  // Fewer questions than the real exam: the official time shrinks in the same proportion.
  const timeLimitMinutes = examModeMinutes(part.minutes, part.total, questionIds.length);

  const simulation = await db.simulation.create({
    data: {
      userId: user.id,
      title: `${plan.name}: ${part.label}`,
      competitionId: plan.competitionId,
      questionCount: questionIds.length,
      timeLimitMinutes,
      examMode: true,
      section: part.label,
      scoringRuleId: plan.rule?.id ?? null,
      subjects: { create: part.subjects.map((s) => ({ subjectId: s.subjectId })) },
      questions: { create: questionIds.map((questionId, order) => ({ questionId, order })) },
    },
    select: { id: true },
  });
  const attempt = await startAttempt(user.id, simulation.id, timeLimitMinutes);
  revalidateSimulations();
  redirect(`/simulados/tentativa/${attempt.id}`);
}

/** "Refazer": same questions, new attempt. Resumes an attempt already in progress. */
export async function retakeSimulationAction(simulationId: string): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const simulation = await db.simulation.findFirst({ where: { id: simulationId, userId: user.id }, select: { id: true, timeLimitMinutes: true } });
  if (!simulation) return fail("Simulado não encontrado.");
  const open = await db.simulationAttempt.findFirst({ where: { simulationId, userId: user.id, status: "IN_PROGRESS" }, select: { id: true } });
  const attemptId = open?.id ?? (await startAttempt(user.id, simulation.id, simulation.timeLimitMinutes)).id;
  revalidateSimulations();
  redirect(`/simulados/tentativa/${attemptId}`);
}

/** Same configuration, new draw of questions. */
export async function redrawSimulationAction(simulationId: string): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const s = await db.simulation.findFirst({ where: { id: simulationId, userId: user.id }, include: { subjects: true } });
  if (!s) return fail("Simulado não encontrado.");
  if (s.purpose === "DIAGNOSTIC") return fail("O diagnóstico não é sorteado de novo. Crie um simulado do concurso.");
  return createSimulationAction({
    title: s.title,
    competitionId: s.competitionId ?? undefined,
    examBoardId: s.examBoardId ?? undefined,
    subjectIds: s.subjects.map((x) => x.subjectId),
    difficulty: s.difficulty,
    questionCount: s.questionCount,
    timeLimitMinutes: s.timeLimitMinutes,
    preferUnanswered: true,
    examMode: s.examMode,
  });
}

const answerSchema = z.object({
  attemptId: z.string(),
  simulationQuestionId: z.string(),
  optionId: z.string().nullable().optional(),
  flagged: z.boolean().optional(),
  /** Seconds on this question since the last report; summed on the server. */
  elapsedSec: z.number().int().min(0).max(3600).optional(),
});

/** Saves an answer or doubt flag. Never reveals correctness while the attempt is open. */
export async function saveSimulationAnswerAction(input: z.input<typeof answerSchema>): Promise<ActionResult<{ expired: boolean }>> {
  return runAction<{ expired: boolean }>(async () => {
    const user = await requireOnboardedUser();
    const parsed = answerSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { attemptId, simulationQuestionId, optionId, flagged, elapsedSec } = parsed.data;

    const attempt = await db.simulationAttempt.findFirst({ where: { id: attemptId, userId: user.id }, select: { id: true, status: true, deadlineAt: true, simulationId: true } });
    if (!attempt) return fail("Tentativa não encontrada.");
    if (attempt.status !== "IN_PROGRESS") return fail("Este simulado já foi finalizado.");
    if (attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
      await finalizeAttempt(user.id, attempt.id, user.profile.timezone);
      revalidateSimulations();
      return ok({ expired: true }, "Tempo esgotado. O simulado foi finalizado.");
    }

    const sq = await db.simulationQuestion.findFirst({
      where: { id: simulationQuestionId, simulationId: attempt.simulationId },
      select: { id: true, question: { select: { options: { select: { id: true } } } } },
    });
    if (!sq) return fail("Questão não pertence a este simulado.");
    if (optionId && !sq.question.options.some((o) => o.id === optionId)) return fail("Alternativa inválida.");

    await db.simulationAnswer.upsert({
      where: { attemptId_simulationQuestionId: { attemptId, simulationQuestionId } },
      update: {
        ...(optionId !== undefined ? { selectedOptionId: optionId, answeredAt: optionId ? new Date() : null } : {}),
        ...(flagged !== undefined ? { flagged } : {}),
        ...(elapsedSec ? { timeSpentSec: { increment: elapsedSec } } : {}),
      },
      create: {
        attemptId,
        simulationQuestionId,
        selectedOptionId: optionId ?? null,
        answeredAt: optionId ? new Date() : null,
        flagged: flagged ?? false,
        timeSpentSec: elapsedSec ?? 0,
      },
    });
    return ok({ expired: false });
  });
}

export async function finishSimulationAction(attemptId: string): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const id = await finalizeAttempt(user.id, attemptId, user.profile.timezone);
  if (!id) return fail("Tentativa não encontrada.");
  revalidateSimulations();
  redirect(`/simulados/resultado/${id}`);
}

export async function deleteSimulationAction(simulationId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.simulation.deleteMany({ where: { id: simulationId, userId: user.id } });
    if (count === 0) return fail("Simulado não encontrado.");
    revalidateSimulations();
    return ok(null, "Simulado excluído. As respostas já registradas continuam no histórico de questões.");
  });
}

/**
 * Optional placement test: official questions of the main competition only,
 * no timer (a suggested time is shown). The result feeds topic progress like
 * any simulation, so the next plan already weighs the weak topics.
 */
export async function startDiagnosticAction(): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const offer = await getDiagnosticOffer(user.id);
  if (!offer) return fail("Escolha um concurso principal antes do diagnóstico.");
  if (offer.existing?.status === "IN_PROGRESS") redirect(`/simulados/tentativa/${offer.existing.id}`);
  if (offer.plan.status === "UNAVAILABLE") return fail("Ainda não há questões oficiais suficientes deste concurso para um diagnóstico.");

  const { questionIds } = await selectQuestions(user.id, {
    competitionId: offer.competitionId,
    subjectIds: Object.keys(offer.plan.quotas),
    count: offer.plan.total,
    preferUnanswered: true,
    sources: ["OFFICIAL"],
    quotas: offer.plan.quotas,
  });
  if (questionIds.length < 5) return fail("Ainda não há questões oficiais suficientes deste concurso para um diagnóstico.");

  const simulation = await db.simulation.create({
    data: {
      userId: user.id,
      title: `Diagnóstico ${offer.competitionName}`,
      competitionId: offer.competitionId,
      purpose: "DIAGNOSTIC",
      questionCount: questionIds.length,
      timeLimitMinutes: null,
      scoringRuleId: (await ruleForCompetition(offer.competitionId))?.id ?? null,
      subjects: { create: Object.keys(offer.plan.quotas).map((subjectId) => ({ subjectId })) },
      questions: { create: questionIds.map((questionId, order) => ({ questionId, order })) },
    },
    select: { id: true },
  });
  const attempt = await startAttempt(user.id, simulation.id, null);
  revalidateSimulations();
  redirect(`/simulados/tentativa/${attempt.id}`);
}
