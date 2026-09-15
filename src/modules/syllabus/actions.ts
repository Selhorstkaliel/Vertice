"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { TOPIC_STATUS_LABEL } from "@/lib/labels";
import { requireOnboardedUser } from "@/modules/auth/session";
import { setTopicStatusManually } from "./progress";

const statusSchema = z.enum(["NOT_STUDIED", "IN_PROGRESS", "STUDIED", "REVIEWED"]);

export async function setTopicStatusAction(topicId: string, status: z.infer<typeof statusSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = statusSchema.safeParse(status);
    if (!parsed.success) return fail("Status inválido.");
    const topic = await db.topic.findFirst({ where: { id: topicId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true, name: true } });
    if (!topic) return fail("Tópico não encontrado.");
    await db.$transaction((tx) => setTopicStatusManually(tx, user.id, topicId, parsed.data, user.profile.timezone));
    revalidatePath("/edital");
    revalidatePath("/painel");
    return ok(null, `${topic.name}: ${TOPIC_STATUS_LABEL[parsed.data].toLowerCase()}.`);
  });
}
