"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";
import { DEADLINE_GRACE_MS, finalizeAttempt, selectQuestions } from "./service";

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

  const { questionIds, available } = await selectQuestions(user.id, {
    competitionId: d.competitionId,
    examBoardId: d.examBoardId,
    subjectIds: d.subjectIds,
    difficulty: d.difficulty,
    count: d.questionCount,
    preferUnanswered: d.preferUnanswered,
  });
  if (questionIds.length < 3) {
    return fail(
      available === 0
        ? "Não há questões com esses filtros. Amplie as matérias ou remova banca e dificuldade."
        : `Só há ${available} ${available === 1 ? "questão" : "questões"} com esses filtros; o mínimo é 3.`,
    );
  }

  const simulation = await db.simulation.create({
    data: {
      userId: user.id,
      title: d.title,
      competitionId: d.competitionId || null,
      examBoardId: d.examBoardId || null,
      difficulty: d.difficulty,
      questionCount: questionIds.length,
      timeLimitMinutes: d.timeLimitMinutes,
      subjects: { create: d.subjectIds.map((subjectId) => ({ subjectId })) },
      questions: { create: questionIds.map((questionId, order) => ({ questionId, order })) },
    },
    select: { id: true },
  });
  const attempt = await startAttempt(user.id, simulation.id, d.timeLimitMinutes);
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
  return createSimulationAction({
    title: s.title,
    competitionId: s.competitionId ?? undefined,
    examBoardId: s.examBoardId ?? undefined,
    subjectIds: s.subjects.map((x) => x.subjectId),
    difficulty: s.difficulty,
    questionCount: s.questionCount,
    timeLimitMinutes: s.timeLimitMinutes,
    preferUnanswered: true,
  });
}

const answerSchema = z.object({
  attemptId: z.string(),
  simulationQuestionId: z.string(),
  optionId: z.string().nullable().optional(),
  flagged: z.boolean().optional(),
});

/** Saves an answer or doubt flag. Never reveals correctness while the attempt is open. */
export async function saveSimulationAnswerAction(input: z.input<typeof answerSchema>): Promise<ActionResult<{ expired: boolean }>> {
  return runAction<{ expired: boolean }>(async () => {
    const user = await requireOnboardedUser();
    const parsed = answerSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { attemptId, simulationQuestionId, optionId, flagged } = parsed.data;

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
      },
      create: {
        attemptId,
        simulationQuestionId,
        selectedOptionId: optionId ?? null,
        answeredAt: optionId ? new Date() : null,
        flagged: flagged ?? false,
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
