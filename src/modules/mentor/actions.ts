"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { firstName } from "@/lib/format";
import { requireOnboardedUser } from "@/modules/auth/session";
import { rateLimit, retryMessage } from "@/modules/auth/rate-limit";
import { runAnalysis } from "./analysis";
import { asGrounding } from "./queries";
import { MENTOR_ANALYSES } from "./suggestions";

const keySchema = z.enum(MENTOR_ANALYSES.map((a) => a.key) as [(typeof MENTOR_ANALYSES)[number]["key"], ...(typeof MENTOR_ANALYSES)[number]["key"][]]);

export async function runMentorAnalysisAction(key: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = keySchema.safeParse(key);
    if (!parsed.success) return fail("Análise desconhecida.");
    const limit = await rateLimit(`mentor-analysis:${user.id}`, 30, 10 * 60_000);
    if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));

    const question = MENTOR_ANALYSES.find((a) => a.key === parsed.data)!.question;
    const result = await runAnalysis({ userId: user.id, firstName: firstName(user.name), profile: user.profile }, parsed.data);
    const now = Date.now();
    await db.$transaction([
      db.mentorMessage.create({ data: { userId: user.id, role: "USER", content: question, grounding: asGrounding({ mode: "rules" }), createdAt: new Date(now) } }),
      db.mentorMessage.create({
        data: {
          userId: user.id,
          role: "ASSISTANT",
          content: result.text,
          grounding: asGrounding({ mode: "rules", sources: result.sources, recommendationIds: result.recommendationIds }),
          createdAt: new Date(now + 1),
        },
      }),
    ]);
    revalidatePath("/mentor");
    if (result.recommendationIds.length) revalidatePath("/plano");
    return ok(null);
  });
}

export async function clearMentorConversationAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.mentorMessage.deleteMany({ where: { userId: user.id } });
    revalidatePath("/mentor");
    return ok(null, count ? "Conversa apagada. As recomendações continuam disponíveis." : "A conversa já estava vazia.");
  });
}
