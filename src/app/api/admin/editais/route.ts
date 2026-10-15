import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { getAdmin } from "@/modules/auth/admin";
import { registerManualFile } from "@/modules/editais/verify";

export const runtime = "nodejs";

const MAX_BYTES = 40_000_000;
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/**
 * Manual upload of an official document (sites that only open in a browser).
 * PDFs exceed the server action body limit, hence a route handler.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json(403, { error: "Origem não permitida." });
  const admin = await getAdmin();
  if (!admin) return json(404, { error: "Não encontrado." });
  try {
    const form = await request.formData();
    const competitionId = String(form.get("competitionId") ?? "");
    const title = String(form.get("title") ?? "").trim().slice(0, 300);
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
    const announce = form.get("announce") === "on";
    const file = form.get("pdf");
    const fieldErrors: Record<string, string[]> = {};
    if (!competitionId) fieldErrors.competitionId = ["Escolha o concurso."];
    if (title.length < 3) fieldErrors.title = ["Informe o título como está no site oficial."];
    try {
      const u = new URL(sourceUrl);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    } catch {
      fieldErrors.sourceUrl = ["Informe o link oficial do documento."];
    }
    if (!(file instanceof File) || file.size === 0) fieldErrors.pdf = ["Escolha o PDF."];
    else if (file.size > MAX_BYTES) fieldErrors.pdf = ["O PDF passa de 40 MB."];
    if (Object.keys(fieldErrors).length) return json(400, { error: "Revise os campos destacados.", fieldErrors });
    const competition = await db.competition.findFirst({ where: { id: competitionId, ownerId: null }, select: { id: true } });
    if (!competition) return json(400, { error: "Concurso do catálogo não encontrado." });
    const r = await registerManualFile({ competitionId, bytes: new Uint8Array(await (file as File).arrayBuffer()), sourceUrl, title, announce });
    return json(200, { id: r.id, duplicate: r.duplicate });
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : "Falha no envio." });
  }
}
