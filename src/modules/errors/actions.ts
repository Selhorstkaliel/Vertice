"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";

const REASONS = ["DID_NOT_KNOW", "CONFUSED_CONCEPTS", "INTERPRETATION", "INATTENTION", "CALCULATION", "FORGOT_FORMULA", "GUESS", "OTHER"] as const;

function revalidateErrors() {
  revalidatePath("/caderno-de-erros");
  revalidatePath("/questoes", "layout");
  revalidatePath("/painel");
  revalidatePath("/plano");
}

const reasonSchema = z.object({
  reason: z.enum(REASONS).nullable(),
  reasonNote: z.string().trim().max(300).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function updateErrorEntryAction(entryId: string, input: z.input<typeof reasonSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { count } = await db.errorEntry.updateMany({
      where: { id: entryId, userId: user.id },
      data: {
        reason: parsed.data.reason,
        ...(parsed.data.reasonNote !== undefined ? { reasonNote: parsed.data.reasonNote || null } : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note || null } : {}),
      },
    });
    if (count === 0) return fail("Registro não encontrado.");
    revalidateErrors();
    return ok(null, "Registro atualizado.");
  });
}

/** Adds a correctly answered attempt (e.g. a lucky guess) to the notebook. */
export async function addAttemptToNotebookAction(attemptId: string, reason: (typeof REASONS)[number]): Promise<ActionResult<{ entryId: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!REASONS.includes(reason)) return fail("Motivo inválido.");
    const attempt = await db.questionAttempt.findFirst({
      where: { id: attemptId, userId: user.id },
      include: { question: { include: { options: true } }, selectedOption: true, errorEntry: true },
    });
    if (!attempt) return fail("Tentativa não encontrada.");
    if (attempt.errorEntry) return ok({ entryId: attempt.errorEntry.id }, "Esta questão já está no Caderno de Erros.");
    const q = attempt.question;
    const entry = await db.errorEntry.create({
      data: {
        userId: user.id,
        questionId: q.id,
        attemptId: attempt.id,
        subjectId: q.subjectId,
        topicId: q.topicId,
        competitionId: q.competitionId,
        examBoardId: q.examBoardId,
        selectedLabel: attempt.selectedOption?.label ?? null,
        correctLabel: q.options.find((o) => o.isCorrect)?.label ?? null,
        reason,
      },
    });
    revalidateErrors();
    return ok({ entryId: entry.id }, "Adicionada ao Caderno de Erros.");
  });
}

export async function setErrorResolvedAction(entryId: string, resolved: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.errorEntry.updateMany({ where: { id: entryId, userId: user.id }, data: { resolvedAt: resolved ? new Date() : null } });
    if (count === 0) return fail("Registro não encontrado.");
    revalidateErrors();
    return ok(null, resolved ? "Marcado como revisado." : "Registro reaberto.");
  });
}

export async function deleteErrorEntryAction(entryId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.errorEntry.deleteMany({ where: { id: entryId, userId: user.id } });
    if (count === 0) return fail("Registro não encontrado.");
    revalidateErrors();
    return ok(null, "Registro removido.");
  });
}
