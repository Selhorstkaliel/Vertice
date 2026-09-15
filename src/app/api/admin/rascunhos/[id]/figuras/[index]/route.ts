import { DomainError } from "@/lib/action";
import { isSameOrigin } from "@/lib/same-origin";
import { getAdmin } from "@/modules/auth/admin";
import { MAX_FIGURE_BYTES, uploadDraftFigure } from "@/modules/exam-papers/service";

export const runtime = "nodejs";

/** Replaces one figure of a question under review with an uploaded image. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  if (!(await getAdmin())) return Response.json({ error: "Não encontrado." }, { status: 404 });
  const { id, index } = await params;
  try {
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Escolha uma imagem." }, { status: 400 });
    if (file.size > MAX_FIGURE_BYTES) return Response.json({ error: "Imagem acima de 2 MB." }, { status: 400 });
    const result = await uploadDraftFigure(id, Number(index), new Uint8Array(await file.arrayBuffer()));
    return Response.json(result);
  } catch (err) {
    if (err instanceof DomainError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[admin/figuras] upload failed", err);
    return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 500 });
  }
}
