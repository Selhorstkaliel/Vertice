import { db } from "@/lib/db";
import { loadFile } from "@/lib/storage";
import { getAdmin } from "@/modules/auth/admin";

export const runtime = "nodejs";

/** The stored PDF, for the review screen. Admin only; never cached publicly. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return new Response("Não encontrado.", { status: 404 });
  const { id } = await params;
  const doc = await db.editalDocument.findUnique({ where: { id }, select: { filePath: true } });
  if (!doc?.filePath) return new Response("Não encontrado.", { status: 404 });
  const bytes = await loadFile("editais", doc.filePath);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
}
