"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";
import { acceptRecommendation, ignoreRecommendation, undoAnyRecommendation } from "./service";

const schema = z.object({
  id: z.string().min(1).max(40),
  decision: z.enum(["accept", "ignore", "undo"]),
  selected: z.array(z.string().max(40)).max(200).optional(),
});

export async function decideRecommendationAnyAction(
  id: string,
  decision: "accept" | "ignore" | "undo",
  selected?: string[],
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = schema.safeParse({ id, decision, selected });
    if (!parsed.success) return fail("Decisão inválida.");
    const { data } = parsed;
    const message =
      data.decision === "accept"
        ? await acceptRecommendation(user.id, data.id, data.selected ?? null)
        : data.decision === "ignore"
          ? await ignoreRecommendation(user.id, data.id)
          : await undoAnyRecommendation(user.id, data.id);
    for (const path of ["/mentor", "/plano", "/rotina", "/painel", "/calendario"]) revalidatePath(path);
    return ok(null, message);
  });
}
