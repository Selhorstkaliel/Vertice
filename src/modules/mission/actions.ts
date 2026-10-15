"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { MISSION_DURATIONS } from "@/engines/study/daily-mission";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getMissionView, missionStarted } from "./service";

function revalidateMission() {
  revalidatePath("/missao");
  revalidatePath("/painel");
}

const minutesSchema = z.number().int().refine((v) => (MISSION_DURATIONS as readonly number[]).includes(v), "Escolha 15, 20 ou 30 minutos.");

/** Changes the mission length. Today's mission is rebuilt only if it has not been started. */
export async function setMissionMinutesAction(minutes: number): Promise<ActionResult<{ rebuilt: boolean }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = minutesSchema.safeParse(minutes);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Duração inválida.");
    await db.profile.update({ where: { userId: user.id }, data: { missionMinutes: parsed.data } });

    const today = await getMissionView(user.id, user.profile.timezone, parsed.data);
    let rebuilt = false;
    if (!today.completedAt && today.targetMinutes !== parsed.data && !(await missionStarted(user.id, today.id))) {
      await db.dailyMission.deleteMany({ where: { id: today.id, userId: user.id } });
      rebuilt = true;
    }
    revalidateMission();
    return ok({ rebuilt }, rebuilt ? `Missão de hoje refeita para ${parsed.data} minutos.` : `A partir da próxima missão: ${parsed.data} minutos.`);
  });
}

/** Marks today's mission as done once every item in it was acted on. Counts for the streak. */
export async function completeMissionAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const view = await getMissionView(user.id, user.profile.timezone, user.profile.missionMinutes);
    if (view.completedAt) return ok(null, "Missão de hoje já concluída.");
    if (view.total === 0) return fail("A missão de hoje não tem itens para concluir.");
    if (view.done < view.total) return fail(`Faltam ${view.total - view.done} itens para concluir a missão.`);
    await db.dailyMission.updateMany({ where: { id: view.id, userId: user.id, completedAt: null }, data: { completedAt: new Date() } });
    revalidateMission();
    return ok(null, "Missão cumprida. Conta para a sua sequência de dias.");
  });
}
