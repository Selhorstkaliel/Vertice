"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/labels";
import { requireOnboardedUser } from "@/modules/auth/session";

const TYPES = Object.keys(NOTIFICATION_TYPE_LABEL) as [keyof typeof NOTIFICATION_TYPE_LABEL, ...(keyof typeof NOTIFICATION_TYPE_LABEL)[]];

function revalidate() {
  // The unread badge lives in the app layout.
  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (typeof id !== "string" || id.length > 40) return fail("Notificação inválida.");
    await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidate();
    return ok(null);
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidate();
    return ok(null, count ? "Notificações marcadas como lidas." : "Nenhuma notificação nova.");
  });
}

export async function clearReadNotificationsAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } });
    revalidate();
    return ok(null, count ? "Notificações lidas removidas." : "Não há notificações lidas.");
  });
}

export async function setNotificationPreferenceAction(type: string, enabled: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = z.object({ type: z.enum(TYPES), enabled: z.boolean() }).safeParse({ type, enabled });
    if (!parsed.success) return fail("Preferência inválida.");
    await db.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: parsed.data.type } },
      update: { enabled: parsed.data.enabled },
      create: { userId: user.id, type: parsed.data.type, enabled: parsed.data.enabled },
    });
    revalidatePath("/notificacoes");
    return ok(null, `${NOTIFICATION_TYPE_LABEL[parsed.data.type]}: ${parsed.data.enabled ? "ativado" : "desativado"}.`);
  });
}
