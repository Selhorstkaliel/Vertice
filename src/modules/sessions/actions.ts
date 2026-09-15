"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { diffDays, isDateKey, localNow, zonedToUtc } from "@/lib/time";
import { effectiveSecondsAt } from "./timing";
import { requireOnboardedUser } from "@/modules/auth/session";
import { applyStudyToTopic } from "@/modules/syllabus/progress";

const KINDS = ["NEW_CONTENT", "QUESTIONS", "REVIEW", "FLASHCARDS", "ERROR_NOTEBOOK", "SIMULATION", "WRITING"] as const;

function revalidateStudy() {
  for (const p of ["/painel", "/plano", "/sessao", "/edital", "/desempenho", "/calendario"]) revalidatePath(p);
  revalidatePath("/", "layout");
}

const startSchema = z.object({
  planItemId: z.string().optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
  kind: z.enum(KINDS).default("NEW_CONTENT"),
});

export async function startSessionAction(input: z.input<typeof startSchema>): Promise<ActionResult<never>> {
  const user = await requireOnboardedUser();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const running = await db.studySession.findFirst({ where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } }, select: { id: true } });
  if (running) return fail("Já existe uma sessão em andamento. Conclua ou descarte antes de iniciar outra.");

  let data = { ...parsed.data, plannedMinutes: null as number | null };
  if (parsed.data.planItemId) {
    const item = await db.studyPlanItem.findFirst({ where: { id: parsed.data.planItemId, userId: user.id } });
    if (!item) return fail("Sessão do plano não encontrada.");
    if (item.status === "DONE") return fail("Esta sessão já foi concluída.");
    data = {
      planItemId: item.id,
      subjectId: item.subjectId ?? undefined,
      topicId: item.topicId ?? undefined,
      kind: item.kind,
      plannedMinutes: item.endMinute - item.startMinute,
    };
  } else if (parsed.data.topicId) {
    const topic = await db.topic.findFirst({
      where: { id: parsed.data.topicId, OR: [{ ownerId: null }, { ownerId: user.id }] },
      select: { subjectId: true },
    });
    if (!topic) return fail("Tópico não encontrado.");
    data.subjectId = topic.subjectId;
  }

  await db.$transaction(async (tx) => {
    await tx.studySession.create({
      data: {
        userId: user.id,
        planItemId: data.planItemId ?? null,
        subjectId: data.subjectId ?? null,
        topicId: data.topicId ?? null,
        kind: data.kind,
        plannedMinutes: data.plannedMinutes,
        startedAt: new Date(),
        status: "RUNNING",
      },
    });
    if (data.planItemId) await tx.studyPlanItem.update({ where: { id: data.planItemId }, data: { status: "IN_PROGRESS" } });
  });
  revalidateStudy();
  redirect("/sessao");
}

async function ownedRunning(userId: string, id: string) {
  return db.studySession.findFirst({ where: { id, userId, status: { in: ["RUNNING", "PAUSED"] } } });
}

export async function pauseSessionAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const s = await ownedRunning(user.id, id);
    if (!s || s.status !== "RUNNING") return fail("Sessão não está em andamento.");
    await db.studySession.update({ where: { id }, data: { status: "PAUSED", pausedAt: new Date() } });
    revalidateStudy();
    return ok(null);
  });
}

export async function resumeSessionAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const s = await ownedRunning(user.id, id);
    if (!s || s.status !== "PAUSED" || !s.pausedAt) return fail("Sessão não está pausada.");
    const paused = Math.floor((Date.now() - s.pausedAt.getTime()) / 1000);
    await db.studySession.update({
      where: { id },
      data: { status: "RUNNING", pausedAt: null, pausedSeconds: s.pausedSeconds + paused },
    });
    revalidateStudy();
    return ok(null);
  });
}

const finishSchema = z
  .object({
    id: z.string(),
    focus: z.number().int().min(1).max(5).nullable(),
    questionsCount: z.number().int().min(0).max(1000).nullable(),
    questionsCorrect: z.number().int().min(0).max(1000).nullable(),
    contentCompleted: z.boolean(),
    notes: z.string().max(2000).optional(),
    /** Optional correction when the timer was left running. */
    effectiveMinutesOverride: z.number().int().min(1).max(600).nullable().optional(),
  })
  .refine((v) => v.questionsCorrect === null || v.questionsCount === null || v.questionsCorrect <= v.questionsCount, {
    path: ["questionsCorrect"],
    message: "Acertos não podem superar o total de questões.",
  });

export async function finishSessionAction(input: z.input<typeof finishSchema>): Promise<ActionResult<{ minutes: number }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = finishSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const s = await ownedRunning(user.id, data.id);
    if (!s) return fail("Sessão não encontrada.");

    const endedAt = new Date();
    const measured = effectiveSecondsAt(s, endedAt);
    const effectiveSeconds = data.effectiveMinutesOverride ? Math.min(measured, data.effectiveMinutesOverride * 60) : measured;
    const minutes = Math.round(effectiveSeconds / 60);

    await db.$transaction(async (tx) => {
      await tx.studySession.update({
        where: { id: s.id },
        data: {
          status: "COMPLETED",
          endedAt,
          pausedAt: null,
          pausedSeconds: s.status === "PAUSED" && s.pausedAt ? s.pausedSeconds + Math.floor((endedAt.getTime() - s.pausedAt.getTime()) / 1000) : s.pausedSeconds,
          effectiveSeconds,
          focus: data.focus,
          questionsCount: data.questionsCount,
          questionsCorrect: data.questionsCorrect,
          notes: data.notes?.trim() || null,
        },
      });
      if (s.planItemId) {
        await tx.studyPlanItem.update({ where: { id: s.planItemId }, data: { status: "DONE", completedAt: endedAt } });
      }
      if (s.topicId) {
        await applyStudyToTopic(tx, {
          userId: user.id,
          topicId: s.topicId,
          minutes,
          kind: s.kind,
          contentCompleted: data.contentCompleted,
          questions: data.questionsCount ? { answered: data.questionsCount, correct: data.questionsCorrect ?? 0 } : undefined,
          at: endedAt,
          tz: user.profile.timezone,
        });
      }
    });
    revalidateStudy();
    return ok({ minutes }, "Sessão registrada.");
  });
}

export async function discardSessionAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const s = await ownedRunning(user.id, id);
    if (!s) return fail("Sessão não encontrada.");
    await db.$transaction(async (tx) => {
      await tx.studySession.update({ where: { id }, data: { status: "ABANDONED", endedAt: new Date(), effectiveSeconds: effectiveSecondsAt(s, new Date()) } });
      if (s.planItemId) await tx.studyPlanItem.update({ where: { id: s.planItemId }, data: { status: "PLANNED" } });
    });
    revalidateStudy();
    return ok(null, "Sessão descartada.");
  });
}

const manualSchema = z
  .object({
    planItemId: z.string().optional(),
    subjectId: z.string().optional(),
    topicId: z.string().optional(),
    kind: z.enum(KINDS),
    /** When true, the session is recorded as ending now (dateKey/startMinute ignored). */
    endsNow: z.boolean().optional(),
    dateKey: z.string().refine(isDateKey, "Data inválida.").optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    minutes: z.number().int().min(1, "Informe a duração.").max(600, "Máximo de 10 horas."),
    focus: z.number().int().min(1).max(5).nullable(),
    questionsCount: z.number().int().min(0).max(1000).nullable(),
    questionsCorrect: z.number().int().min(0).max(1000).nullable(),
    contentCompleted: z.boolean(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.questionsCorrect === null || v.questionsCount === null || v.questionsCorrect <= v.questionsCount, {
    path: ["questionsCorrect"],
    message: "Acertos não podem superar o total de questões.",
  })
  .refine((v) => v.endsNow || (v.dateKey !== undefined && v.startMinute !== undefined), {
    path: ["dateKey"],
    message: "Informe data e horário.",
  });

export async function logManualSessionAction(input: z.input<typeof manualSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const tz = user.profile.timezone;

    const startedAt = data.endsNow ? new Date(Date.now() - data.minutes * 60_000) : zonedToUtc(data.dateKey!, data.startMinute!, tz);
    const endedAt = new Date(startedAt.getTime() + data.minutes * 60_000);
    if (endedAt.getTime() > Date.now() + 5 * 60_000) return fail("Registre apenas sessões que já aconteceram.");
    if (!data.endsNow && diffDays(data.dateKey!, localNow(tz).key) > 60) return fail("Registre sessões dos últimos 60 dias.");

    let planItem: { id: string; subjectId: string | null; topicId: string | null; kind: (typeof KINDS)[number] } | null = null;
    if (data.planItemId) {
      planItem = await db.studyPlanItem.findFirst({
        where: { id: data.planItemId, userId: user.id, status: { in: ["PLANNED", "MISSED", "IN_PROGRESS"] } },
        select: { id: true, subjectId: true, topicId: true, kind: true },
      });
      if (!planItem) return fail("Sessão do plano não encontrada.");
    }
    const topicId = planItem?.topicId ?? data.topicId ?? null;
    let subjectId = planItem?.subjectId ?? data.subjectId ?? null;
    if (topicId && !planItem) {
      const topic = await db.topic.findFirst({ where: { id: topicId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { subjectId: true } });
      if (!topic) return fail("Tópico não encontrado.");
      subjectId = topic.subjectId;
    } else if (subjectId && !planItem) {
      const subject = await db.subject.findFirst({ where: { id: subjectId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true } });
      if (!subject) return fail("Disciplina não encontrada.");
    }
    const kind = planItem?.kind ?? data.kind;

    await db.$transaction(async (tx) => {
      await tx.studySession.create({
        data: {
          userId: user.id,
          planItemId: planItem?.id ?? null,
          subjectId,
          topicId,
          kind,
          status: "COMPLETED",
          isManual: true,
          startedAt,
          endedAt,
          effectiveSeconds: data.minutes * 60,
          focus: data.focus,
          questionsCount: data.questionsCount,
          questionsCorrect: data.questionsCorrect,
          notes: data.notes?.trim() || null,
        },
      });
      if (planItem) await tx.studyPlanItem.update({ where: { id: planItem.id }, data: { status: "DONE", completedAt: endedAt } });
      if (topicId) {
        await applyStudyToTopic(tx, {
          userId: user.id,
          topicId,
          minutes: data.minutes,
          kind,
          contentCompleted: data.contentCompleted,
          questions: data.questionsCount ? { answered: data.questionsCount, correct: data.questionsCorrect ?? 0 } : undefined,
          at: endedAt,
          tz,
        });
      }
    });
    revalidateStudy();
    return ok(null, "Sessão registrada.");
  });
}
