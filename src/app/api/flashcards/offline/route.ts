import { getCurrentUser } from "@/modules/auth/session";
import { getOfflinePack } from "@/modules/flashcards/offline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cards for offline review. Never cached by the browser or the service worker. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const pack = await getOfflinePack(user.id, user.profile.timezone);
  return Response.json(pack, { headers: { "Cache-Control": "no-store" } });
}
