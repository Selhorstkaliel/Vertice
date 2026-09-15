"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { db } from "@/lib/db";
import { requireAdmin } from "@/modules/auth/admin";
import { describeQuestionAiError, QuestionAiError, questionAiConfigured } from "@/modules/ai/gemini";
import { generateStyleQuestions, MAX_GENERATED_PER_RUN } from "./generate";
import { startExtraction } from "./runner";
import { approveCleanDrafts, cropDraftFigure, deleteExamPaper, rejectDraft, removeDraftFigure, restoreDraft, saveDraft } from "./service";

const id = z.string().min(1).max(40);

function revalidate(paperId?: string | null) {
  revalidatePath("/admin/provas");
  if (paperId) revalidatePath(`/admin/provas/${paperId}`);
  revalidatePath("/admin/geradas");
  revalidatePath("/questoes");
}

async function draftPaper(draftId: string) {
  const draft = await db.questionDraft.findUnique({ where: { id: id.parse(draftId) }, select: { examPaperId: true } });
  return draft ? { paperId: draft.examPaperId } : null;
}

export async function startExtractionAction(paperId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    if (!questionAiConfigured()) return fail("Configure GEMINI_API_KEY no servidor para ler provas.");
    const paper = await db.examPaper.findUnique({ where: { id: id.parse(paperId) }, select: { status: true, leaseUntil: true } });
    if (!paper) return fail("Prova não encontrada.");
    if (paper.leaseUntil && paper.leaseUntil > new Date()) return fail("A leitura desta prova já está em andamento.");
    if (paper.status === "PUBLISHED") return fail("Todas as questões desta prova já foram revisadas.");
    startExtraction(paperId);
    revalidate(paperId);
    return ok(null, "Leitura iniciada. O progresso aparece nesta página.");
  });
}

export async function deletePaperAction(paperId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    await deleteExamPaper(id.parse(paperId));
    revalidate();
    return ok(null, "Prova removida.");
  });
}

const draftSchema = z.object({
  statement: z.string().trim().min(1, "Escreva o enunciado.").max(20_000),
  options: z.array(z.object({ label: z.string().max(3), text: z.string().max(4_000) })).min(2, "Inclua ao menos duas alternativas.").max(5),
  correctLabel: z.string().max(1).nullable(),
  explanation: z.string().max(20_000).nullable(),
  subjectId: z.string().max(40).nullable().transform((v) => v || null),
  topicId: z.string().max(40).nullable().transform((v) => v || null),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  figureDescriptions: z.array(z.string().max(300)).max(20),
});

export type DraftInput = z.input<typeof draftSchema>;

export async function saveDraftAction(draftId: string, input: DraftInput, approve: boolean): Promise<ActionResult<{ published: boolean }>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const draft = await draftPaper(draftId);
    if (!draft) return fail("Questão em revisão não encontrada.");
    const result = await saveDraft(draftId, parsed.data, approve);
    revalidate(draft.paperId);
    return ok(result, result.published ? (approve ? "Questão publicada no banco." : "Questão publicada atualizada.") : "Alterações salvas.");
  });
}

export async function setDraftStatusAction(draftId: string, action: "reject" | "restore"): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const draft = await draftPaper(draftId);
    if (!draft) return fail("Questão em revisão não encontrada.");
    if (action === "reject") await rejectDraft(draftId);
    else await restoreDraft(draftId);
    revalidate(draft.paperId);
    return ok(null, action === "reject" ? "Questão rejeitada." : "Questão de volta para revisão.");
  });
}

export async function approveCleanAction(filter: { examPaperId?: string; origin?: "GENERATED" }): Promise<ActionResult<{ published: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const { published, failed } = await approveCleanDrafts({ examPaperId: filter.examPaperId ? id.parse(filter.examPaperId) : undefined, origin: filter.origin });
    revalidate(filter.examPaperId);
    if (published === 0 && failed.length === 0) return fail("Nenhuma questão sem pendências para publicar.");
    return ok({ published }, `${published} questão(ões) publicada(s).${failed.length ? ` ${failed.length} ficaram para revisão.` : ""}`);
  });
}

const cropSchema = z.object({ index: z.number().int().min(0).max(19), page: z.number().int().min(1).max(500), box: z.array(z.number().min(0).max(1000)).length(4) });

export async function cropFigureAction(draftId: string, index: number, page: number, box: number[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = cropSchema.safeParse({ index, page, box });
    if (!parsed.success) return fail("Recorte inválido.");
    const draft = await draftPaper(draftId);
    if (!draft) return fail("Questão em revisão não encontrada.");
    await cropDraftFigure(draftId, parsed.data.index, parsed.data.page, parsed.data.box);
    revalidate(draft.paperId);
    return ok(null, "Figura recortada.");
  });
}

export async function removeFigureAction(draftId: string, index: number): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const draft = await draftPaper(draftId);
    if (!draft) return fail("Questão em revisão não encontrada.");
    await removeDraftFigure(draftId, z.number().int().min(0).parse(index));
    revalidate(draft.paperId);
    return ok(null, "Figura removida. Tire também o marcador [[FIGURA n]] do texto.");
  });
}

const generationSchema = z.object({
  competitionId: id,
  subjectId: id,
  topicId: z.string().max(40).nullable().transform((v) => v || null),
  count: z.number().int().min(1).max(MAX_GENERATED_PER_RUN),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
});

export async function generateQuestionsAction(input: z.input<typeof generationSchema>): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    await requireAdmin();
    if (!questionAiConfigured()) return fail("Configure GEMINI_API_KEY no servidor para gerar questões.");
    const parsed = generationSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    try {
      const { created } = await generateStyleQuestions(parsed.data);
      revalidate();
      return ok({ created }, `${created} questão(ões) gerada(s). Revise antes de publicar.`);
    } catch (err) {
      if (err instanceof QuestionAiError) return fail(describeQuestionAiError(err));
      throw err;
    }
  });
}
