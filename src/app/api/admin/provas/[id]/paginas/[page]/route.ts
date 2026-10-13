import { db } from "@/lib/db";
import { getAdmin } from "@/modules/auth/admin";
import { renderPage } from "@/modules/exam-papers/pdf";

export const runtime = "nodejs";

/** One rendered page of an imported exam, for the figure crop editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await params;
  if (!(await getAdmin())) return new Response("Não encontrado", { status: 404 });
  const number = Number(page);
  const paper = await db.examPaper.findUnique({ where: { id }, select: { id: true, filePath: true } });
  if (!paper || !Number.isInteger(number) || number < 1) return new Response("Página não encontrada", { status: 404 });
  try {
    const png = await renderPage(paper.id, paper.filePath, number);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    // Uma página fora do intervalo é esperada; qualquer outra falha é problema de
    // renderização e precisa aparecer, não virar um 404 mudo.
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("out of range")) console.error(`[provas] falha ao renderizar a página ${number} de ${paper.id}:`, err);
    return new Response("Página não encontrada", { status: 404 });
  }
}
