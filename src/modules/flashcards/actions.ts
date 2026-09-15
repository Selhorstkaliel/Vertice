"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { formatDateTime } from "@/lib/format";
import { ERROR_REASON_LABEL } from "@/lib/labels";
import { requireOnboardedUser } from "@/modules/auth/session";
import { reviewCard } from "@/engines/review/spaced-repetition";
import { toSchedule } from "./service";

function revalidateFlashcards(id?: string) {
  revalidatePath("/flashcards");
  if (id) revalidatePath(`/flashcards/${id}`);
  revalidatePath("/painel");
  revalidatePath("/caderno-de-erros");
}

const TYPES = ["CONCEPT", "FORMULA", "TRAP", "PERSONAL_ERROR", "RULE", "DEFINITION", "FROM_QUESTION"] as const;

const cardSchema = z
  .object({
    front: z.string().trim().min(1, "Escreva a frente do cartão.").max(2000),
    back: z.string().trim().min(1, "Escreva o verso do cartão.").max(4000),
    type: z.enum(TYPES),
    subjectId: z.string().optional(),
    topicId: z.string().optional(),
    competitionId: z.string().optional(),
    examBoardId: z.string().optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    isBoardPattern: z.boolean(),
    patternEvidence: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    // §24: a board pattern is never presented as fact without evidence.
    if (v.isBoardPattern && (v.patternEvidence?.length ?? 0) < 10) {
      ctx.addIssue({ code: "custom", path: ["patternEvidence"], message: "Descreva a evidência: provas, anos ou questões em que o padrão aparece." });
    }
    if (v.isBoardPattern && !v.examBoardId) {
      ctx.addIssue({ code: "custom", path: ["examBoardId"], message: "Informe a banca do padrão." });
    }
  });

export type FlashcardInput = z.input<typeof cardSchema>;

async function validateRefs(userId: string, d: z.infer<typeof cardSchema>) {
  const visible = { OR: [{ ownerId: null }, { ownerId: userId }] };
  if (d.subjectId && !(await db.subject.findFirst({ where: { id: d.subjectId, ...visible }, select: { id: true } }))) return "Disciplina inválida.";
  if (d.topicId) {
    const t = await db.topic.findFirst({ where: { id: d.topicId, ...visible, ...(d.subjectId ? { subjectId: d.subjectId } : {}) }, select: { id: true } });
    if (!t) return "Tópico inválido.";
  }
  if (d.examBoardId && !(await db.examBoard.findUnique({ where: { id: d.examBoardId }, select: { id: true } }))) return "Banca inválida.";
  if (d.competitionId && !(await db.competition.findFirst({ where: { id: d.competitionId, ...visible }, select: { id: true } }))) return "Concurso inválido.";
  return null;
}

function cardData(d: z.infer<typeof cardSchema>) {
  return {
    front: d.front,
    back: d.back,
    type: d.type,
    subjectId: d.subjectId || null,
    topicId: d.topicId || null,
    competitionId: d.competitionId || null,
    examBoardId: d.examBoardId || null,
    difficulty: d.difficulty,
    tags: [...new Set(d.tags.map((t) => t.toLowerCase()))],
    isBoardPattern: d.isBoardPattern,
    patternEvidence: d.isBoardPattern ? d.patternEvidence || null : null,
  };
}

export async function createFlashcardAction(input: FlashcardInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = cardSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const refError = await validateRefs(user.id, parsed.data);
    if (refError) return fail(refError);
    const card = await db.flashcard.create({ data: { userId: user.id, origin: "MANUAL", ...cardData(parsed.data) }, select: { id: true } });
    revalidateFlashcards();
    return ok({ id: card.id }, "Flashcard criado.");
  });
}

export async function updateFlashcardAction(id: string, input: FlashcardInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = cardSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const refError = await validateRefs(user.id, parsed.data);
    if (refError) return fail(refError);
    const { count } = await db.flashcard.updateMany({ where: { id, userId: user.id }, data: cardData(parsed.data) });
    if (count === 0) return fail("Flashcard não encontrado.");
    revalidateFlashcards(id);
    return ok(null, "Flashcard salvo.");
  });
}

export async function deleteFlashcardAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.flashcard.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return fail("Flashcard não encontrado.");
    revalidateFlashcards();
    return ok(null, "Flashcard excluído.");
  });
}

export async function setFlashcardSuspendedAction(id: string, suspended: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.flashcard.updateMany({ where: { id, userId: user.id }, data: { suspended } });
    if (count === 0) return fail("Flashcard não encontrado.");
    revalidateFlashcards(id);
    return ok(null, suspended ? "Flashcard suspenso: não aparece nas revisões." : "Flashcard reativado.");
  });
}

function questionFront(q: { statement: string; type: string; options: { label: string; text: string }[] }) {
  if (q.type === "TRUE_FALSE") return `${q.statement}\n\nCerto ou errado?`;
  return `${q.statement}\n\n${q.options.map((o) => `${o.label}) ${o.text}`).join("\n")}`;
}

export async function createFlashcardFromQuestionAction(questionId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const existing = await db.flashcard.findFirst({ where: { userId: user.id, sourceQuestionId: questionId }, select: { id: true } });
    if (existing) return ok({ id: existing.id }, "Você já tem um flashcard desta questão.");
    const q = await db.question.findFirst({
      where: { id: questionId, OR: [{ ownerId: null }, { ownerId: user.id }] },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!q) return fail("Questão não encontrada.");
    const correct = q.options.find((o) => o.isCorrect);
    const card = await db.flashcard.create({
      data: {
        userId: user.id,
        front: questionFront(q),
        back: [`Resposta: ${correct ? (q.type === "TRUE_FALSE" ? correct.text : `${correct.label}) ${correct.text}`) : "—"}`, q.explanation].filter(Boolean).join("\n\n"),
        type: "FROM_QUESTION",
        origin: "QUESTION",
        sourceQuestionId: q.id,
        subjectId: q.subjectId,
        topicId: q.topicId,
        competitionId: q.competitionId,
        examBoardId: q.examBoardId,
        difficulty: q.difficulty,
        tags: [],
      },
      select: { id: true },
    });
    revalidateFlashcards();
    revalidatePath(`/questoes/${q.id}`);
    return ok({ id: card.id }, "Flashcard criado a partir da questão.");
  });
}

export async function createFlashcardFromErrorAction(entryId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const entry = await db.errorEntry.findFirst({
      where: { id: entryId, userId: user.id },
      include: { question: { include: { options: { orderBy: { order: "asc" } } } }, flashcards: { select: { id: true }, take: 1 } },
    });
    if (!entry) return fail("Registro não encontrado.");
    if (entry.flashcards[0]) return ok({ id: entry.flashcards[0].id }, "Este erro já virou flashcard.");
    const q = entry.question;
    const correct = q?.options.find((o) => o.isCorrect);
    const lesson = [
      entry.reason ? `Motivo do erro: ${ERROR_REASON_LABEL[entry.reason]}.` : null,
      entry.reasonNote,
      entry.note,
    ].filter(Boolean);
    const card = await db.flashcard.create({
      data: {
        userId: user.id,
        front: q ? questionFront(q) : "Erro registrado",
        back: [
          correct ? `Resposta: ${q!.type === "TRUE_FALSE" ? correct.text : `${correct.label}) ${correct.text}`}` : null,
          entry.selectedLabel ? `Você marcou: ${entry.selectedLabel}.` : null,
          lesson.length ? lesson.join(" ") : null,
          q?.explanation ?? null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        type: "PERSONAL_ERROR",
        origin: "ERROR_NOTEBOOK",
        errorEntryId: entry.id,
        sourceQuestionId: q?.id ?? null,
        subjectId: entry.subjectId,
        topicId: entry.topicId,
        competitionId: entry.competitionId,
        examBoardId: entry.examBoardId,
        tags: ["erro-pessoal"],
      },
      select: { id: true },
    });
    revalidateFlashcards();
    return ok({ id: card.id }, "Flashcard de erro pessoal criado.");
  });
}

const reviewSchema = z.object({
  id: z.string(),
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  durationMs: z.number().int().min(0).max(30 * 60_000).nullable(),
});

export async function reviewFlashcardAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ explanation: string; nextDue: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail("Avaliação inválida.");
    const card = await db.flashcard.findFirst({ where: { id: parsed.data.id, userId: user.id, suspended: false } });
    if (!card) return fail("Flashcard não encontrado.");
    const now = new Date();
    const { next, explanation } = reviewCard(toSchedule(card), parsed.data.rating, now);
    await db.$transaction([
      db.flashcard.update({
        where: { id: card.id },
        data: {
          state: next.state,
          intervalDays: next.intervalDays,
          ease: next.ease,
          reps: next.reps,
          lapses: next.lapses,
          learningStep: next.learningStep,
          dueAt: next.dueAt,
          lastReviewedAt: now,
        },
      }),
      db.flashcardReview.create({
        data: {
          flashcardId: card.id,
          userId: user.id,
          rating: parsed.data.rating,
          stateBefore: card.state,
          intervalBefore: card.intervalDays,
          intervalAfter: next.intervalDays,
          easeBefore: card.ease,
          easeAfter: next.ease,
          durationMs: parsed.data.durationMs,
          reviewedAt: now,
        },
      }),
    ]);
    revalidatePath("/painel");
    return ok({ explanation, nextDue: formatDateTime(next.dueAt, user.profile.timezone) });
  });
}
