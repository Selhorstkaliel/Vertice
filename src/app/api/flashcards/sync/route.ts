import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSameOrigin } from "@/lib/same-origin";
import { getCurrentUser } from "@/modules/auth/session";
import { applyOfflineReviews, offlineReviewSchema } from "@/modules/flashcards/offline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reviews: z.array(offlineReviewSchema).max(500) });
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Uploads reviews made offline. Safe to repeat: each review carries a client id. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json(403, { error: "Origem não permitida." });
  const user = await getCurrentUser();
  if (!user?.profile) return json(401, { error: "Sua sessão expirou. Entre novamente para sincronizar." });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Revisões inválidas." });
  const results = await applyOfflineReviews(user.id, parsed.data.reviews);
  if (results.some((r) => r.status === "applied" || r.status === "recorded")) {
    revalidatePath("/flashcards");
    revalidatePath("/painel");
  }
  return json(200, { results });
}
