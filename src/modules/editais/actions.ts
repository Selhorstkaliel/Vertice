"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/modules/auth/admin";
import { requireOnboardedUser } from "@/modules/auth/session";
import { publishDocument, reviewChange, reviewField, adoptOfficialExamDate } from "./review";
import { checkSource, downloadDocumentFile } from "./verify";
import { editalAiConfigured, readDocument } from "./read";
import { announceDocument } from "./verify";

function revalidateAdmin(id?: string) {
  revalidatePath("/admin/editais");
  if (id) revalidatePath(`/admin/editais/${id}`);
}

const fieldReviewSchema = z.object({
  documentId: z.string().min(1),
  key: z.string().min(1).max(200),
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  // Edited value as JSON text (dates, lists or objects), validated as JSON here.
  value: z.string().max(200_000).optional(),
});

export async function reviewFieldAction(input: z.input<typeof fieldReviewSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const parsed = fieldReviewSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    let value: unknown = undefined;
    if (parsed.data.value !== undefined) {
      try {
        value = JSON.parse(parsed.data.value);
      } catch {
        return fail("O valor editado não é um JSON válido.");
      }
      if (parsed.data.key.startsWith("data:") && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return fail("Use uma data no formato \"AAAA-MM-DD\".");
    }
    await reviewField(parsed.data.documentId, parsed.data.key, { status: parsed.data.status, value }, admin.id);
    revalidateAdmin(parsed.data.documentId);
    return ok(null);
  });
}

export async function reviewChangeAction(changeId: string, status: "APPROVED" | "REJECTED" | "PENDING"): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) return fail("Status inválido.");
    await reviewChange(changeId, status);
    revalidateAdmin();
    return ok(null);
  });
}

export async function publishDocumentAction(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const r = await publishDocument(documentId, admin.id);
    revalidateAdmin(documentId);
    revalidatePath("/editais");
    revalidatePath("/concursos", "layout");
    return ok(null, `Publicado: ${r.applied} campos aplicados ao concurso; ${r.followers} alunos avisados.`);
  });
}

export async function setDocumentTypeAction(documentId: string, type: "EDITAL" | "RETIFICACAO" | "CONVOCACAO" | "RESULTADO" | "OUTRO"): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const t = z.enum(["EDITAL", "RETIFICACAO", "CONVOCACAO", "RESULTADO", "OUTRO"]).safeParse(type);
    if (!t.success) return fail("Tipo inválido.");
    const doc = await db.editalDocument.findUnique({ where: { id: documentId }, select: { status: true, filePath: true } });
    if (!doc || doc.status === "PUBLISHED") return fail("Documento não encontrado ou já publicado.");
    const read = t.data === "EDITAL" || t.data === "RETIFICACAO";
    await db.editalDocument.update({
      where: { id: documentId },
      data: { type: t.data, typedBy: "admin", ...(read && doc.filePath && doc.status === "IGNORED" ? { status: "NEW", statusNote: null } : {}), ...(!read && doc.status === "NEW" ? { status: "IGNORED", statusNote: "Sem leitura completa." } : {}) },
    });
    revalidateAdmin(documentId);
    return ok(null, "Tipo atualizado.");
  });
}

export async function ignoreDocumentAction(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { count } = await db.editalDocument.updateMany({ where: { id: documentId, status: { not: "PUBLISHED" } }, data: { status: "IGNORED", statusNote: "Ignorado pelo admin.", leaseUntil: null } });
    if (count === 0) return fail("Documento não encontrado ou já publicado.");
    revalidateAdmin(documentId);
    return ok(null, "Documento ignorado.");
  });
}

/** Reads a document now (manual trigger). Long: runs in the request, like the exam importer's admin button. */
export async function readDocumentAction(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    if (!editalAiConfigured()) return fail("Configure GEMINI_API_KEY e EDITAL_AI_MODELS para ler editais.");
    await db.editalDocument.updateMany({ where: { id: documentId, status: { in: ["FAILED", "IGNORED"] }, filePath: { not: null } }, data: { status: "NEW" } });
    const r = await readDocument(documentId, () => undefined);
    revalidateAdmin(documentId);
    return r.done ? ok(null, "Leitura concluída. Revise os campos.") : fail(r.reason ?? "Não foi possível ler.");
  });
}

export async function downloadDocumentAction(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    try {
      await downloadDocumentFile(documentId);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Falha ao baixar.");
    }
    revalidateAdmin(documentId);
    return ok(null, "Arquivo baixado. Agora é possível ler com IA.");
  });
}

export async function checkSourceAction(sourceId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const r = await checkSource(sourceId, () => undefined, { force: true });
    revalidateAdmin();
    if (!r) return fail("Fonte inativa ou só abre no navegador.");
    return r.error ? fail(r.error) : ok(null, r.baseline ? `${r.found} documentos registrados como histórico.` : `${r.new} documentos novos.`);
  });
}

export async function setSourceActiveAction(sourceId: string, active: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    await db.editalSource.update({ where: { id: sourceId }, data: { active, ...(active ? { consecutiveFailures: 0, lastError: null } : {}) } });
    revalidateAdmin();
    return ok(null, active ? "Fonte ativada." : "Fonte desativada.");
  });
}

/** Re-sends the notice with the official link (for a historical document the admin judges relevant). */
export async function announceDocumentAction(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    await db.editalDocument.update({ where: { id: documentId }, data: { baseline: false } });
    const sent = await announceDocument(documentId);
    revalidateAdmin(documentId);
    return ok(null, `${sent} avisos enviados.`);
  });
}

/* ── student ──────────────────────────────────────────────────────── */

export async function adoptOfficialExamDateAction(competitionId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    await adoptOfficialExamDate(user.id, competitionId);
    for (const p of ["/painel", "/editais", "/calendario", "/plano"]) revalidatePath(p);
    revalidatePath(`/concursos/${competitionId}`);
    return ok(null, "Agora vale a data oficial da prova.");
  });
}
