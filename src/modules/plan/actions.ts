"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { formatClock, formatMinutes } from "@/lib/format";
import { addDays, dbDateToKey, isDateKey, isoWeekdayOfKey, keyToDbDate, localNow, startOfWeek } from "@/lib/time";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getActiveRoutine } from "@/modules/routine/service";
import { AVAILABLE_CATEGORIES } from "@/engines/routine/availability";
import {
  ACTIVE_STATUSES,
  applyRecommendation,
  cutoffMinute,
  findPlacements,
  generateWeekPlan,
  proposeRedistribution,
  undoRecommendation,
} from "./service";

function revalidatePlan() {
  revalidatePath("/plano");
  revalidatePath("/painel");
  revalidatePath("/calendario");
}

export async function generatePlanAction(week: "current" | "next" = "current"): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const enrollments = await db.studentCompetition.count({ where: { userId: user.id, status: "ACTIVE" } });
    if (enrollments === 0) return fail("Adicione um concurso ativo antes de gerar o plano.");
    const result = await generateWeekPlan(user.id, { week: week === "next" ? "next" : "current" });
    revalidatePlan();
    if (result.created === 0) {
      return ok({ created: 0 }, week === "next" ? "Nenhuma sessão: não há horários livres ou conteúdos disponíveis na próxima semana." : "Nenhuma sessão nova: não há horários livres ou conteúdos disponíveis para o restante da semana.");
    }
    return ok(
      { created: result.created },
      `${result.created} sessões planejadas — ${formatMinutes(result.plannedMinutes)} na semana (recomendado: ${formatMinutes(result.recommendedMinutes)}).`,
    );
  });
}

async function ownedItem(userId: string, itemId: string) {
  const item = await db.studyPlanItem.findFirst({ where: { id: itemId, userId } });
  if (!item) return null;
  return item;
}

const statusSchema = z.enum(["skip", "cancel", "restore"]);

export async function setPlanItemStatusAction(itemId: string, action: z.infer<typeof statusSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = statusSchema.safeParse(action);
    if (!parsed.success) return fail("Ação inválida.");
    const item = await ownedItem(user.id, itemId);
    if (!item) return fail("Sessão não encontrada.");

    if (parsed.data === "restore") {
      if (!["SKIPPED", "CANCELED"].includes(item.status)) return fail("Esta sessão não pode ser restaurada.");
      await db.studyPlanItem.update({ where: { id: item.id }, data: { status: "PLANNED" } });
      revalidatePlan();
      return ok(null, "Sessão restaurada.");
    }
    if (item.status === "DONE" || item.status === "IN_PROGRESS") return fail("Sessões concluídas ou em andamento não podem ser alteradas.");
    await db.studyPlanItem.update({
      where: { id: item.id },
      data: { status: parsed.data === "skip" ? "SKIPPED" : "CANCELED" },
    });
    revalidatePlan();
    return ok(null, parsed.data === "skip" ? "Sessão ignorada." : "Sessão cancelada.");
  });
}

/** "Adiar": moves the session to the best free slot later this week. */
export async function postponePlanItemAction(itemId: string): Promise<ActionResult<{ dateKey: string; startMinute: number }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const item = await ownedItem(user.id, itemId);
    if (!item) return fail("Sessão não encontrada.");
    if (!["PLANNED", "MISSED"].includes(item.status)) return fail("Só sessões planejadas podem ser adiadas.");

    const minutes = item.endMinute - item.startMinute;
    const { placements } = await findPlacements(user.id, [{ id: item.id, minutes, kind: item.kind }], {
      excludeDate: item.status === "PLANNED" ? dbDateToKey(item.date) : undefined,
      weekStart: item.status === "PLANNED" ? startOfWeek(dbDateToKey(item.date)) : undefined,
    });
    const p = placements.get(item.id);
    if (!p) return fail("Sem horário livre compatível nesta semana. Use Reagendar para escolher outro horário.");

    await db.$transaction([
      db.studyPlanItem.update({ where: { id: item.id }, data: { status: "POSTPONED" } }),
      db.studyPlanItem.create({
        data: {
          planId: item.planId,
          userId: user.id,
          date: keyToDbDate(p.dateKey),
          startMinute: p.startMinute,
          endMinute: p.endMinute,
          kind: item.kind,
          slotClass: p.slotClass,
          subjectId: item.subjectId,
          topicId: item.topicId,
          competitionId: item.competitionId,
          priorityScore: item.priorityScore,
          reason: item.reason,
          reasonData: item.reasonData as Prisma.InputJsonValue,
          notes: item.notes,
          rescheduledFromId: item.id,
        },
      }),
    ]);
    revalidatePlan();
    const [, m, d] = p.dateKey.split("-");
    return ok({ dateKey: p.dateKey, startMinute: p.startMinute }, `Sessão adiada para ${d}/${m} às ${formatClock(p.startMinute)}.`);
  });
}

const rescheduleSchema = z.object({
  itemId: z.string(),
  dateKey: z.string().refine(isDateKey, "Data inválida."),
  startMinute: z.number().int().min(0).max(1439),
});

/** "Reagendar": user-chosen slot, validated against fixed commitments and other sessions. */
export async function reschedulePlanItemAction(input: z.input<typeof rescheduleSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = rescheduleSchema.safeParse(input);
    if (!parsed.success) return fail("Data ou horário inválido.");
    const { itemId, dateKey, startMinute } = parsed.data;
    const item = await ownedItem(user.id, itemId);
    if (!item) return fail("Sessão não encontrada.");
    if (!["PLANNED", "MISSED"].includes(item.status)) return fail("Só sessões planejadas podem ser reagendadas.");

    const tz = user.profile.timezone;
    const local = localNow(tz);
    // Sessions move within their own plan week (never into the past).
    const weekStart = startOfWeek(dbDateToKey(item.date)) > startOfWeek(local.key) ? startOfWeek(dbDateToKey(item.date)) : startOfWeek(local.key);
    if (dateKey < local.key || dateKey < weekStart || dateKey > addDays(weekStart, 6)) return fail("Escolha um dia entre hoje e o domingo da semana do plano.");
    if (dateKey === local.key && startMinute < cutoffMinute(local.minute)) return fail("Escolha um horário futuro.");

    const endMinute = startMinute + (item.endMinute - item.startMinute);
    if (endMinute > 1440) return fail("A sessão precisa terminar até 24:00.");

    const routine = await getActiveRoutine(user.id);
    const iso = isoWeekdayOfKey(dateKey);
    const blocking = routine?.blocks.find(
      (b) => b.dayOfWeek === iso && !AVAILABLE_CATEGORIES.has(b.category) && b.startMinute < endMinute && startMinute < b.endMinute,
    );
    if (blocking) {
      return fail(`Esse horário coincide com um compromisso da rotina (${formatClock(blocking.startMinute)}–${formatClock(blocking.endMinute)}).`);
    }
    const clash = await db.studyPlanItem.findFirst({
      where: {
        userId: user.id,
        id: { not: item.id },
        date: keyToDbDate(dateKey),
        status: { in: ACTIVE_STATUSES },
        startMinute: { lt: endMinute },
        endMinute: { gt: startMinute },
      },
      select: { startMinute: true, endMinute: true },
    });
    if (clash) return fail(`Já existe uma sessão das ${formatClock(clash.startMinute)} às ${formatClock(clash.endMinute)}.`);

    const planWeek = await db.studyPlan.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart: keyToDbDate(weekStart) } },
      select: { id: true },
    });
    await db.$transaction([
      db.studyPlanItem.update({ where: { id: item.id }, data: { status: "POSTPONED" } }),
      db.studyPlanItem.create({
        data: {
          planId: planWeek?.id ?? item.planId,
          userId: user.id,
          date: keyToDbDate(dateKey),
          startMinute,
          endMinute,
          kind: item.kind,
          slotClass: item.slotClass,
          subjectId: item.subjectId,
          topicId: item.topicId,
          competitionId: item.competitionId,
          priorityScore: item.priorityScore,
          reason: item.reason,
          reasonData: item.reasonData as Prisma.InputJsonValue,
          notes: item.notes,
          rescheduledFromId: item.id,
        },
      }),
    ]);
    revalidatePlan();
    return ok(null, "Sessão reagendada.");
  });
}

export async function updatePlanItemNotesAction(itemId: string, notes: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const text = z.string().max(1000).safeParse(notes);
    if (!text.success) return fail("Observação muito longa.");
    const { count } = await db.studyPlanItem.updateMany({ where: { id: itemId, userId: user.id }, data: { notes: text.data.trim() || null } });
    if (count === 0) return fail("Sessão não encontrada.");
    revalidatePlan();
    return ok(null, "Observação salva.");
  });
}

export async function proposeRedistributionAction(): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const id = await proposeRedistribution(user.id);
    revalidatePlan();
    return ok({ id });
  });
}

export async function decideRecommendationAction(
  id: string,
  decision: "accept" | "ignore" | "undo",
  selectedItemIds?: string[],
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (decision === "ignore") {
      const { count } = await db.aiRecommendation.updateMany({
        where: { id, userId: user.id, status: "PENDING" },
        data: { status: "IGNORED", decidedAt: new Date() },
      });
      if (count === 0) return fail("Recomendação não encontrada.");
      revalidatePlan();
      return ok(null, "Recomendação ignorada.");
    }
    if (decision === "undo") {
      await undoRecommendation(user.id, id);
      revalidatePlan();
      return ok(null, "Alteração desfeita.");
    }
    const rec = await db.aiRecommendation.findFirst({ where: { id, userId: user.id }, select: { proposedChanges: true } });
    const total = ((rec?.proposedChanges as { moves?: unknown[] } | null)?.moves ?? []).length;
    const edited = selectedItemIds && selectedItemIds.length < total;
    const applied = await applyRecommendation(user.id, id, selectedItemIds ?? null, edited ? "EDITED" : "ACCEPTED");
    revalidatePlan();
    return ok(null, applied === 1 ? "1 sessão reagendada." : `${applied} sessões reagendadas.`);
  });
}
