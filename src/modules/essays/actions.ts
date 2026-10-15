"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { essaysEnabled } from "@/lib/plan-limits";
import { keyToDbDate, localNow, startOfWeek } from "@/lib/time";
import { estimateLines, paragraphsOf } from "@/engines/essays/correction";
import { DEFAULT_ESSAY_MINUTES } from "@/engines/essays/cadence";
import { requireOnboardedUser } from "@/modules/auth/session";
import { AiOutputError, claudeConfigured } from "@/modules/ai/claude";
import { findPlacements } from "@/modules/plan/service";
import { correctEssay, correctParagraphRewrite } from "./correct";
import { cadenceFor, essayEnrollments, essayQuota, parseCriteria, publishedRubricFor, syncEssayFlashcards } from "./service";

const MIN_CHARS = 200;
const MAX_CHARS = 12_000;

function revalidateEssays(id?: string) {
  revalidatePath("/redacao");
  if (id) revalidatePath(`/redacao/${id}`);
  revalidatePath("/painel");
}

async function essayUser() {
  const user = await requireOnboardedUser();
  if (!essaysEnabled(user)) return null;
  return user;
}

/** Student-facing message for a failed AI call; the quota is untouched. */
function aiFailure(err: unknown) {
  if (err instanceof AiOutputError) {
    if (err.reason === "unavailable") return "A correção automática não está configurada neste servidor.";
    if (err.reason === "refusal") return "A IA não conseguiu corrigir este texto. Revise o conteúdo e tente de novo.";
    return "A correção veio em formato inválido duas vezes e foi descartada. Tente de novo em alguns minutos; sua cota não foi usada.";
  }
  if (err instanceof Anthropic.RateLimitError) return "O serviço de IA está com muitas solicitações agora. Tente de novo em instantes; sua cota não foi usada.";
  if (err instanceof Anthropic.APIError) return "O serviço de IA está instável agora. Tente de novo em alguns minutos; sua cota não foi usada.";
  console.error("[essays] correction failed", err);
  return "Não foi possível corrigir agora. Tente de novo; sua cota não foi usada.";
}

const draftSchema = z.object({
  id: z.string().optional(),
  competitionId: z.string().min(1),
  themeId: z.string().nullable(),
  originalId: z.string().nullable().optional(),
  text: z.string().max(MAX_CHARS, `Máximo de ${MAX_CHARS} caracteres.`),
  timeSpentSec: z.number().int().min(0).max(24 * 3600).nullable(),
  timed: z.boolean(),
});

export async function saveEssayDraftAction(input: z.input<typeof draftSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await essayUser();
    if (!user) return fail("A área de redação ainda não está disponível.");
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const d = parsed.data;
    const enrollment = await db.studentCompetition.findFirst({ where: { userId: user.id, competitionId: d.competitionId }, select: { id: true } });
    if (!enrollment) return fail("Concurso não encontrado na sua lista.");
    const rubric = await publishedRubricFor(d.competitionId);
    if (!rubric) return fail("Este concurso ainda não tem critérios de redação publicados.");
    if (d.themeId) {
      const theme = await db.essayTheme.findFirst({ where: { id: d.themeId, status: "PUBLISHED", competitionId: rubric.competitionId }, select: { id: true } });
      if (!theme) return fail("Tema não encontrado.");
    }
    const data = {
      text: d.text,
      charCount: d.text.length,
      estimatedLines: estimateLines(d.text, rubric.charsPerLine),
      timeSpentSec: d.timeSpentSec,
      timed: d.timed,
    };
    if (d.id) {
      const { count } = await db.essay.updateMany({ where: { id: d.id, userId: user.id, status: "DRAFT" }, data });
      if (count === 0) return fail("Rascunho não encontrado ou já enviado.");
      return ok({ id: d.id });
    }
    const original = d.originalId ? await db.essay.findFirst({ where: { id: d.originalId, userId: user.id }, select: { id: true } }) : null;
    const created = await db.essay.create({
      data: { userId: user.id, rubricId: rubric.id, themeId: d.themeId, originalId: original?.id ?? null, ...data },
      select: { id: true },
    });
    revalidateEssays();
    return ok({ id: created.id });
  });
}

export async function submitEssayAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await essayUser();
    if (!user) return fail("A área de redação ainda não está disponível.");
    if (!claudeConfigured()) return fail("A correção automática não está configurada neste servidor.");
    const essay = await db.essay.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true, text: true, rubric: { select: { publishedAt: true } } } });
    if (!essay) return fail("Redação não encontrada.");
    if (essay.status === "CORRECTED") return ok({ id }, "Esta redação já foi corrigida.");
    if (!essay.rubric.publishedAt) return fail("Os critérios desta redação foram despublicados. Fale com o suporte.");
    if (essay.text.trim().length < MIN_CHARS) return fail(`Escreva pelo menos ${MIN_CHARS} caracteres antes de enviar.`);
    if (paragraphsOf(essay.text).length < 2) return fail("Separe o texto em parágrafos antes de enviar.");
    const quota = await essayQuota(user, user.profile.timezone);
    if (quota.correctionsLeft <= 0) return fail(`Você usou as ${quota.correctionsLimit} correções deste mês. A cota renova no dia 1º.`);

    // Locks the essay against a second submit while the correction runs.
    const { count } = await db.essay.updateMany({ where: { id, userId: user.id, status: "DRAFT" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    if (count === 0) return fail("Esta redação já está em correção.");
    try {
      await correctEssay(user.id, id);
    } catch (err) {
      await db.essay.updateMany({ where: { id, userId: user.id, status: "SUBMITTED" }, data: { status: "DRAFT", submittedAt: null } });
      revalidateEssays(id);
      return fail(aiFailure(err));
    }
    await syncEssayFlashcards(user.id).catch((err) => console.error("[essays] flashcards", err));
    revalidateEssays(id);
    revalidatePath("/flashcards");
    return ok({ id }, "Correção pronta.");
  });
}

/** Full rewrite: a new draft that points to the corrected essay. */
export async function startEssayRewriteAction(id: string): Promise<ActionResult<never>> {
  const user = await essayUser();
  if (!user) return fail("A área de redação ainda não está disponível.");
  const essay = await db.essay.findFirst({ where: { id, userId: user.id, status: "CORRECTED" }, select: { id: true, text: true, themeId: true, rubricId: true, charCount: true, estimatedLines: true } });
  if (!essay) return fail("Redação não encontrada.");
  const draft = await db.essay.create({
    data: { userId: user.id, rubricId: essay.rubricId, themeId: essay.themeId, originalId: essay.id, text: essay.text, charCount: essay.charCount, estimatedLines: essay.estimatedLines },
    select: { id: true },
  });
  revalidateEssays();
  redirect(`/redacao/escrever?rascunho=${draft.id}`);
}

export async function deleteEssayDraftAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await essayUser();
    if (!user) return fail("A área de redação ainda não está disponível.");
    const { count } = await db.essay.deleteMany({ where: { id, userId: user.id, status: "DRAFT" } });
    if (count === 0) return fail("Rascunho não encontrado.");
    revalidateEssays();
    return ok(null, "Rascunho excluído.");
  });
}

const paragraphSchema = z.object({ essayId: z.string().min(1), text: z.string().trim().min(40, "Escreva o parágrafo reescrito.").max(3000) });

/** Rewrite exercise: only the paragraph and the criterion go to the AI, never the whole essay. */
export async function rewriteParagraphAction(input: z.input<typeof paragraphSchema>): Promise<ActionResult<{ improved: boolean }>> {
  return runAction(async () => {
    const user = await essayUser();
    if (!user) return fail("A área de redação ainda não está disponível.");
    if (!claudeConfigured()) return fail("A correção automática não está configurada neste servidor.");
    const parsed = paragraphSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const essay = await db.essay.findFirst({
      where: { id: parsed.data.essayId, userId: user.id, status: "CORRECTED" },
      include: { rubric: { select: { criteria: true } }, theme: { select: { title: true } }, corrections: { orderBy: { createdAt: "desc" }, take: 1, select: { exercise: true } } },
    });
    const exercise = z.object({ index: z.number().int(), criterionKey: z.string(), instruction: z.string() }).safeParse(essay?.corrections[0]?.exercise);
    if (!essay || !exercise.success) return fail("Esta redação não tem exercício de reescrita.");
    const criterion = parseCriteria(essay.rubric.criteria).find((c) => c.key === exercise.data.criterionKey);
    const original = paragraphsOf(essay.text)[exercise.data.index];
    if (!criterion || !original) return fail("Não foi possível localizar o parágrafo do exercício.");
    const quota = await essayQuota(user, user.profile.timezone);
    if (quota.rewritesLeft <= 0) return fail(`Você usou as ${quota.rewritesLimit} reescritas deste mês.`);
    try {
      const r = await correctParagraphRewrite({ userId: user.id, essayId: essay.id, themeTitle: essay.theme?.title ?? null, criterion, instruction: exercise.data.instruction, original, rewrite: parsed.data.text });
      await db.essayParagraphRewrite.create({
        data: { essayId: essay.id, paragraphIndex: exercise.data.index, criterionKey: criterion.key, originalText: original, newText: parsed.data.text, feedback: r.data, model: r.model },
      });
      revalidateEssays(essay.id);
      return ok({ improved: r.data.improved }, r.data.improved ? "A reescrita melhorou o trecho." : "Veja o comentário e tente de novo.");
    } catch (err) {
      return fail(aiFailure(err));
    }
  });
}

/**
 * Student-approved: places this week's remaining essays from the cadence into
 * free slots of the current plan. Never runs on its own.
 */
export async function addEssaysToPlanAction(): Promise<ActionResult<{ added: number }>> {
  return runAction(async () => {
    const user = await essayUser();
    if (!user) return fail("A área de redação ainda não está disponível.");
    const enrollments = await essayEnrollments(user.id);
    const primary = enrollments[0];
    if (!primary) return fail("Nenhum concurso seu tem critérios de redação publicados.");
    const tz = user.profile.timezone;
    const weekStart = startOfWeek(localNow(tz).key);
    const plan = await db.studyPlan.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart: keyToDbDate(weekStart) } }, select: { id: true } });
    if (!plan) return fail("Gere o plano da semana antes de incluir redações.");
    const cadence = await cadenceFor(user, primary);
    const planned = await db.studyPlanItem.count({ where: { planId: plan.id, kind: "WRITING", status: { in: ["PLANNED", "IN_PROGRESS"] } } });
    const missing = Math.max(0, cadence.remainingThisWeek - planned);
    if (missing === 0) return ok({ added: 0 }, "As redações desta semana já estão no plano.");
    const { placements } = await findPlacements(user.id, Array.from({ length: missing }, (_, i) => ({ id: `essay-${i}`, minutes: DEFAULT_ESSAY_MINUTES, kind: "WRITING" as const })));
    if (placements.size === 0) return fail("Não há horário livre de cerca de 75 minutos no restante da semana.");
    const subject = await db.subject.findFirst({ where: { slug: "redacao", ownerId: null }, select: { id: true } });
    await db.studyPlanItem.createMany({
      data: [...placements.values()].map((p) => ({
        planId: plan.id,
        userId: user.id,
        date: keyToDbDate(p.dateKey),
        startMinute: p.startMinute,
        endMinute: p.endMinute,
        kind: "WRITING" as const,
        slotClass: p.slotClass,
        subjectId: subject?.id ?? null,
        competitionId: primary.competitionId,
        priorityScore: 1,
        reason: cadence.reason,
        reasonData: { source: "essay-cadence", phase: cadence.phase, perWeek: cadence.perWeek },
      })),
    });
    revalidatePath("/plano");
    revalidatePath("/calendario");
    revalidateEssays();
    return ok({ added: placements.size }, placements.size === 1 ? "1 redação incluída no plano." : `${placements.size} redações incluídas no plano.`);
  });
}
