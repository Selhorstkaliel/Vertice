"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { isDateKey, keyToDbDate } from "@/lib/time";
import { requireAdmin } from "@/modules/auth/admin";
import { requireOnboardedUser } from "@/modules/auth/session";

const KINDS = ["DOCUMENT", "HEALTH_EXAM", "REGISTRATION_DEADLINE", "APPEAL_DEADLINE", "OTHER"] as const;

const dateOrNull = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || isDateKey(v), "Data inválida.")
  .transform((v) => (v ? keyToDbDate(v) : null));

function revalidateStages() {
  revalidatePath("/militar");
  revalidatePath("/concursos", "layout");
  revalidatePath("/calendario");
}

/* ── student ──────────────────────────────────────────────────────── */

const newItemSchema = z.object({
  title: z.string().trim().min(2, "Descreva o item.").max(120),
  kind: z.enum(KINDS),
  dueDate: dateOrNull,
});

export async function addStageItemAction(stageId: string, input: z.input<typeof newItemSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = newItemSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const stage = await db.studentStage.findFirst({ where: { id: stageId, enrollment: { userId: user.id } }, select: { id: true, _count: { select: { items: true } } } });
    if (!stage) return fail("Etapa não encontrada.");
    await db.studentStageItem.create({
      data: { studentStageId: stage.id, title: parsed.data.title, kind: parsed.data.kind, dueDate: parsed.data.dueDate, order: stage._count.items, verification: "USER_PROVIDED" },
    });
    revalidateStages();
    return ok(null, "Item adicionado.");
  });
}

const updateItemSchema = z.object({
  done: z.boolean().optional(),
  dueDate: dateOrNull.optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function updateStageItemAction(itemId: string, input: z.input<typeof updateItemSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = updateItemSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const item = await db.studentStageItem.findFirst({ where: { id: itemId, stage: { enrollment: { userId: user.id } } }, select: { id: true, dueDate: true } });
    if (!item) return fail("Item não encontrado.");
    const d = parsed.data;
    const dateChanged = d.dueDate !== undefined && (d.dueDate?.getTime() ?? null) !== (item.dueDate?.getTime() ?? null);
    await db.studentStageItem.update({
      where: { id: item.id },
      data: {
        ...(d.done !== undefined ? { doneAt: d.done ? new Date() : null } : {}),
        // A date the student changes is theirs, no longer the catalog's.
        ...(dateChanged ? { dueDate: d.dueDate, dateFromCatalog: false } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      },
    });
    revalidateStages();
    return ok(null, d.done === true ? "Item concluído." : d.done === false ? "Item reaberto." : "Item atualizado.");
  });
}

/** Only items the student added can be removed; catalog items are marked done or kept. */
export async function removeStageItemAction(itemId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.studentStageItem.deleteMany({ where: { id: itemId, catalogItemId: null, stage: { enrollment: { userId: user.id } } } });
    if (count === 0) return fail("Só itens adicionados por você podem ser removidos.");
    revalidateStages();
    return ok(null, "Item removido.");
  });
}

/* ── admin: catalog checklist ─────────────────────────────────────── */

const catalogItemSchema = z
  .object({
    stageId: z.string().min(1),
    kind: z.enum(KINDS),
    title: z.string().trim().min(2, "Descreva o item.").max(120),
    description: z.string().trim().max(500).optional(),
    dueDate: dateOrNull,
    sourceUrl: z.preprocess((v) => (v === "" ? null : v), z.string().url("Link inválido.").max(500).nullable()),
    sourceYear: z.preprocess((v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : v), z.number().int().min(1990).max(2100).nullable()),
    verified: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.sourceUrl) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Informe o link do edital de onde veio o item." });
    if (v.verified && v.sourceYear === null) ctx.addIssue({ code: "custom", path: ["sourceYear"], message: "Informe o ano do edital verificado." });
  });

export type CatalogItemInput = z.input<typeof catalogItemSchema>;

export async function addCatalogStageItemAction(input: CatalogItemInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = catalogItemSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    const stage = await db.competitionStage.findFirst({ where: { id: d.stageId, competition: { ownerId: null } }, select: { id: true, _count: { select: { items: true } } } });
    if (!stage) return fail("Etapa do catálogo não encontrada.");
    await db.competitionStageItem.create({
      data: {
        stageId: stage.id,
        kind: d.kind,
        title: d.title,
        description: d.description || null,
        dueDate: d.dueDate,
        order: stage._count.items,
        sourceUrl: d.sourceUrl,
        sourceYear: d.sourceYear,
        verification: d.verified ? "VERIFIED" : "UNVERIFIED",
      },
    });
    revalidatePath("/admin/etapas");
    revalidateStages();
    return ok(null, "Item cadastrado. Ele aparece para os alunos na próxima visita às etapas.");
  });
}

export async function removeCatalogStageItemAction(itemId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { count } = await db.competitionStageItem.deleteMany({ where: { id: itemId } });
    if (count === 0) return fail("Item não encontrado.");
    revalidatePath("/admin/etapas");
    return ok(null, "Item removido do catálogo. As cópias dos alunos continuam como itens próprios.");
  });
}
