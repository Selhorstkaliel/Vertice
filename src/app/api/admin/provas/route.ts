import { DomainError } from "@/lib/action";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { getAdmin } from "@/modules/auth/admin";
import { questionAiConfigured, documentAiSetupHint } from "@/modules/ai/documents";
import { startExtraction } from "@/modules/exam-papers/runner";
import { createExamPaper, downloadPdf, MAX_PDF_BYTES } from "@/modules/exam-papers/service";

export const runtime = "nodejs";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

async function pdfFrom(form: FormData, fileField: string, urlField: string) {
  const file = form.get(fileField);
  const url = String(form.get(urlField) ?? "").trim();
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PDF_BYTES) throw new DomainError("O PDF passa de 40 MB.");
    return { bytes: new Uint8Array(await file.arrayBuffer()), url: url || null };
  }
  if (url) return { bytes: await downloadPdf(url), url };
  return null;
}

/**
 * Imports an official exam (upload or public address) and starts reading it.
 * Exam PDFs exceed the server action body limit, hence a route handler.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json(403, { error: "Origem não permitida." });
  const admin = await getAdmin();
  if (!admin) return json(404, { error: "Não encontrado." });

  try {
    const form = await request.formData();
    const competitionId = String(form.get("competitionId") ?? "");
    const year = Number(form.get("year"));
    const version = String(form.get("version") ?? "").trim().slice(0, 80);
    const title = String(form.get("title") ?? "").trim().slice(0, 160) || null;
    const fieldErrors: Record<string, string[]> = {};
    if (!competitionId) fieldErrors.competitionId = ["Escolha o concurso."];
    if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1) fieldErrors.year = ["Informe o ano da prova."];
    if (version.length < 2) fieldErrors.version = ["Informe a versão, como 2º dia, prova branca."];
    if (Object.keys(fieldErrors).length) return json(400, { error: "Revise os campos destacados.", fieldErrors });

    const pdf = await pdfFrom(form, "pdf", "pdfUrl");
    if (!pdf) return json(400, { error: "Envie o PDF da prova ou informe o endereço oficial.", fieldErrors: { pdf: ["Envie o PDF ou informe o endereço."] } });
    const key = await pdfFrom(form, "answerKey", "answerKeyUrl");
    const paper = await createExamPaper(
      { competitionId, year, version, title, pdf: pdf.bytes, answerKey: key?.bytes ?? null, sourceUrl: pdf.url, answerKeyUrl: key?.url ?? null },
      admin.id,
    );
    if (!questionAiConfigured()) {
      await db.examPaper.update({ where: { id: paper.id }, data: { statusNote: documentAiSetupHint() } });
      return json(201, { id: paper.id, started: false });
    }
    return json(201, { id: paper.id, started: startExtraction(paper.id) });
  } catch (err) {
    if (err instanceof DomainError) return json(400, { error: err.message });
    console.error("[admin/provas] import failed", err);
    return json(500, { error: "Não foi possível importar a prova. Tente novamente." });
  }
}
