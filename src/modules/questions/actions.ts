"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { explanationAuthorship } from "@/lib/question-content";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";
import { applyStudyToTopic } from "@/modules/syllabus/progress";

function revalidateQuestions(id?: string) {
  revalidatePath("/questoes");
  if (id) revalidatePath(`/questoes/${id}`);
  revalidatePath("/caderno-de-erros");
  revalidatePath("/edital");
  revalidatePath("/painel");
  revalidatePath("/desempenho");
}

export interface AnswerResult {
  isCorrect: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  correctLabel: string;
  explanation: string | null;
  /** Set when the resolution was written with AI; shown with it. */
  explanationNote: string | null;
  errorEntryId: string | null;
  attemptId: string;
}

const answerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
  timeSpentSec: z.number().int().min(0).max(24 * 3600).nullable(),
});

/**
 * Records an answer. Correctness is decided here — the client never receives
 * the answer key before answering. Wrong answers open an error-notebook entry
 * automatically (§20).
 */
export async function answerQuestionAction(input: z.input<typeof answerSchema>): Promise<ActionResult<AnswerResult>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = answerSchema.safeParse(input);
    if (!parsed.success) return fail("Resposta inválida.");
    const { questionId, optionId, timeSpentSec } = parsed.data;

    const q = await db.question.findFirst({
      where: { id: questionId, OR: [{ ownerId: null }, { ownerId: user.id }] },
      include: { options: true },
    });
    if (!q) return fail("Questão não encontrada.");
    const selected = q.options.find((o) => o.id === optionId);
    const correct = q.options.find((o) => o.isCorrect);
    if (!selected || !correct) return fail("Alternativa inválida.");
    const isCorrect = selected.isCorrect;
    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      const attempt = await tx.questionAttempt.create({
        data: { userId: user.id, questionId: q.id, selectedOptionId: selected.id, isCorrect, timeSpentSec, context: "PRACTICE" },
      });
      await tx.userQuestionState.upsert({
        where: { userId_questionId: { userId: user.id, questionId: q.id } },
        update: { attempts: { increment: 1 }, lastCorrect: isCorrect, lastAttemptAt: now, ...(isCorrect ? { reviewLater: false } : {}) },
        create: { userId: user.id, questionId: q.id, attempts: 1, lastCorrect: isCorrect, lastAttemptAt: now },
      });
      if (q.topicId) {
        await applyStudyToTopic(tx, {
          userId: user.id,
          topicId: q.topicId,
          minutes: 0,
          kind: "QUESTIONS",
          contentCompleted: false,
          questions: { answered: 1, correct: isCorrect ? 1 : 0 },
          at: now,
          tz: user.profile.timezone,
        });
      }
      let errorEntryId: string | null = null;
      if (!isCorrect) {
        const entry = await tx.errorEntry.create({
          data: {
            userId: user.id,
            questionId: q.id,
            attemptId: attempt.id,
            subjectId: q.subjectId,
            topicId: q.topicId,
            competitionId: q.competitionId,
            examBoardId: q.examBoardId,
            selectedLabel: selected.label,
            correctLabel: correct.label,
          },
        });
        errorEntryId = entry.id;
      }
      return { attemptId: attempt.id, errorEntryId };
    });

    revalidateQuestions(q.id);
    return ok({
      isCorrect,
      selectedOptionId: selected.id,
      correctOptionId: correct.id,
      correctLabel: correct.label,
      explanation: q.explanation,
      explanationNote: q.explanation ? explanationAuthorship(q.source, q.aiModel) : null,
      errorEntryId: result.errorEntryId,
      attemptId: result.attemptId,
    });
  });
}

export async function toggleQuestionFlagAction(questionId: string, flag: "favorite" | "reviewLater", value: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (flag !== "favorite" && flag !== "reviewLater") return fail("Ação inválida.");
    const q = await db.question.findFirst({ where: { id: questionId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true } });
    if (!q) return fail("Questão não encontrada.");
    await db.userQuestionState.upsert({
      where: { userId_questionId: { userId: user.id, questionId } },
      update: { [flag]: value },
      create: { userId: user.id, questionId, [flag]: value },
    });
    revalidateQuestions(questionId);
    const message = flag === "favorite" ? (value ? "Questão favoritada." : "Removida das favoritas.") : value ? "Marcada para resolver novamente depois." : "Removida da lista para revisar.";
    return ok(null, message);
  });
}

const optionSchema = z.object({ text: z.string().trim().min(1, "Preencha a alternativa.").max(1000), isCorrect: z.boolean() });

const questionSchema = z
  .object({
    type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE"]),
    statement: z.string().trim().min(10, "Escreva o enunciado.").max(8000),
    explanation: z.string().trim().max(8000).optional(),
    options: z.array(optionSchema).max(5),
    subjectId: z.string().min(1, "Escolha a disciplina."),
    topicId: z.string().optional(),
    examBoardId: z.string().optional(),
    competitionId: z.string().optional(),
    year: z.number().int().min(1950).max(2100).nullable(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    source: z.enum(["USER", "OFFICIAL", "LICENSED"]),
    sourceReference: z.string().trim().max(500).optional(),
    trueFalseAnswer: z.enum(["Certo", "Errado"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "MULTIPLE_CHOICE") {
      if (v.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Inclua pelo menos duas alternativas." });
      if (v.options.filter((o) => o.isCorrect).length !== 1) ctx.addIssue({ code: "custom", path: ["options"], message: "Marque exatamente uma alternativa correta." });
    } else if (!v.trueFalseAnswer) {
      ctx.addIssue({ code: "custom", path: ["trueFalseAnswer"], message: "Informe o gabarito." });
    }
    // Rights and origin must be traceable (§18).
    if ((v.source === "OFFICIAL" || v.source === "LICENSED") && (v.sourceReference?.length ?? 0) < 5) {
      ctx.addIssue({ code: "custom", path: ["sourceReference"], message: "Informe a origem: prova, edital ou licença." });
    }
  });

export type QuestionInput = z.input<typeof questionSchema>;

async function validateRefs(userId: string, data: z.infer<typeof questionSchema>) {
  const visible = { OR: [{ ownerId: null }, { ownerId: userId }] };
  const subject = await db.subject.findFirst({ where: { id: data.subjectId, ...visible }, select: { id: true } });
  if (!subject) return "Disciplina não encontrada.";
  if (data.topicId) {
    const topic = await db.topic.findFirst({ where: { id: data.topicId, subjectId: data.subjectId, ...visible }, select: { id: true } });
    if (!topic) return "Assunto não pertence à disciplina.";
  }
  if (data.examBoardId && !(await db.examBoard.findUnique({ where: { id: data.examBoardId }, select: { id: true } }))) return "Banca inválida.";
  if (data.competitionId) {
    const c = await db.competition.findFirst({ where: { id: data.competitionId, ...visible }, select: { id: true } });
    if (!c) return "Concurso inválido.";
  }
  return null;
}

function optionRows(data: z.infer<typeof questionSchema>) {
  const labels = ["A", "B", "C", "D", "E"];
  return data.type === "TRUE_FALSE"
    ? [
        { label: "C", text: "Certo", isCorrect: data.trueFalseAnswer === "Certo", order: 0 },
        { label: "E", text: "Errado", isCorrect: data.trueFalseAnswer === "Errado", order: 1 },
      ]
    : data.options.map((o, i) => ({ label: labels[i]!, text: o.text, isCorrect: o.isCorrect, order: i }));
}

export async function createQuestionAction(input: QuestionInput): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const refError = await validateRefs(user.id, parsed.data);
  if (refError) return fail(refError);
  const d = parsed.data;
  const q = await db.question.create({
    data: {
      type: d.type,
      statement: d.statement,
      explanation: d.explanation || null,
      subjectId: d.subjectId,
      topicId: d.topicId || null,
      examBoardId: d.examBoardId || null,
      competitionId: d.competitionId || null,
      year: d.year,
      difficulty: d.difficulty,
      source: d.source,
      sourceReference: d.sourceReference || null,
      ownerId: user.id,
      options: { create: optionRows(d) },
    },
    select: { id: true },
  });
  revalidateQuestions();
  redirect(`/questoes/${q.id}`);
}

export async function updateQuestionAction(id: string, input: QuestionInput): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const existing = await db.question.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return fail("Só é possível editar questões cadastradas por você.");
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const refError = await validateRefs(user.id, parsed.data);
  if (refError) return fail(refError);
  const d = parsed.data;
  const [attempts, currentOptions] = await Promise.all([
    db.questionAttempt.count({ where: { questionId: id } }),
    db.questionOption.findMany({ where: { questionId: id }, orderBy: { order: "asc" }, select: { id: true } }),
  ]);
  const rows = optionRows(d);
  // Answered questions keep option identities so history stays consistent.
  if (attempts > 0 && rows.length !== currentOptions.length) {
    return fail("Esta questão já foi respondida: mantenha o mesmo número de alternativas.");
  }
  await db.$transaction(async (tx) => {
    await tx.question.update({
      where: { id },
      data: {
        type: d.type,
        statement: d.statement,
        explanation: d.explanation || null,
        subjectId: d.subjectId,
        topicId: d.topicId || null,
        examBoardId: d.examBoardId || null,
        competitionId: d.competitionId || null,
        year: d.year,
        difficulty: d.difficulty,
        source: d.source,
        sourceReference: d.sourceReference || null,
      },
    });
    if (attempts === 0) {
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionOption.createMany({ data: rows.map((o) => ({ ...o, questionId: id })) });
    } else {
      for (const [i, row] of rows.entries()) {
        await tx.questionOption.update({ where: { id: currentOptions[i]!.id }, data: { text: row.text, isCorrect: row.isCorrect } });
      }
    }
  });
  revalidateQuestions(id);
  redirect(`/questoes/${id}`);
}

export async function deleteQuestionAction(id: string): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const { count } = await db.question.deleteMany({ where: { id, ownerId: user.id } });
  if (count === 0) return fail("Só é possível excluir questões cadastradas por você.");
  revalidateQuestions();
  redirect("/questoes");
}
