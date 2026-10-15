"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/modules/auth/admin";
import { claudeConfigured } from "@/modules/ai/claude";
import { criteriaSchema } from "./service";
import { collectThemeBatch, generateThemesNow, submitThemeBatch } from "./themes";

function revalidateAdmin() {
  revalidatePath("/admin/redacao");
  revalidatePath("/redacao", "layout");
}

const optionalInt = (min: number, max: number) => z.preprocess((v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : v), z.number().int().min(min).max(max).nullable());

const rubricSchema = z
  .object({
    id: z.string().optional(),
    competitionId: z.string().min(1, "Escolha o concurso."),
    year: optionalInt(1990, 2100),
    editalUrl: z.preprocess((v) => (v === "" ? null : v), z.string().url("Link inválido.").max(500).nullable()),
    textType: z.string().trim().min(3, "Informe o tipo de texto.").max(200),
    minLines: optionalInt(1, 200),
    maxLines: optionalInt(1, 200),
    charsPerLine: z.number().int().min(30).max(150),
    criteria: criteriaSchema,
    zeroingRules: z.array(z.string().trim().min(3).max(300)).max(20),
    verified: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.minLines !== null && v.maxLines !== null && v.minLines > v.maxLines) ctx.addIssue({ code: "custom", path: ["minLines"], message: "Mínimo maior que o máximo." });
    if (v.verified && (!v.editalUrl || v.year === null)) ctx.addIssue({ code: "custom", path: ["editalUrl"], message: "Para marcar como verificada, informe o link e o ano do edital." });
  });

export type RubricInput = z.input<typeof rubricSchema>;

export async function saveRubricAction(input: RubricInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const parsed = rubricSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { id, ...d } = parsed.data;
    const competition = await db.competition.findFirst({ where: { id: d.competitionId, ownerId: null }, select: { id: true } });
    if (!competition) return fail("Concurso do catálogo não encontrado.");
    const data = { ...d, reviewedById: admin.id };
    if (id) {
      const { count } = await db.essayRubric.updateMany({ where: { id }, data });
      if (count === 0) return fail("Rubrica não encontrada.");
      revalidateAdmin();
      return ok({ id }, "Rubrica salva.");
    }
    const created = await db.essayRubric.create({ data, select: { id: true } });
    revalidateAdmin();
    return ok({ id: created.id }, "Rubrica criada como rascunho. Publique para liberar a correção.");
  });
}

export async function publishRubricAction(id: string, publish: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { count } = await db.essayRubric.updateMany({ where: { id }, data: { publishedAt: publish ? new Date() : null, reviewedById: admin.id } });
    if (count === 0) return fail("Rubrica não encontrada.");
    revalidateAdmin();
    return ok(null, publish ? "Rubrica publicada: a correção fica disponível para o concurso." : "Rubrica despublicada.");
  });
}

const supportSchema = z.array(z.object({ title: z.string().trim().max(200), text: z.string().trim().min(10).max(3000), source: z.string().trim().max(300) })).max(5);

const officialThemeSchema = z.object({
  competitionId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  prompt: z.string().trim().min(20).max(4000),
  year: z.number().int().min(1990).max(2100),
  supportTexts: supportSchema,
});

/** An official theme from a past exam, with its year. Published directly: it is the real thing. */
export async function saveOfficialThemeAction(input: z.input<typeof officialThemeSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const parsed = officialThemeSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    await db.essayTheme.create({
      data: {
        competitionId: d.competitionId,
        title: d.title,
        prompt: d.prompt,
        year: d.year,
        origin: "OFFICIAL",
        status: "PUBLISHED",
        supportTexts: d.supportTexts.map((s) => ({ ...s, generated: false })),
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    revalidateAdmin();
    return ok(null, "Tema oficial cadastrado.");
  });
}

const reviewSchema = z.object({
  status: z.enum(["PUBLISHED", "REJECTED", "DRAFT"]),
  title: z.string().trim().min(3).max(200).optional(),
  prompt: z.string().trim().min(20).max(4000).optional(),
});

export async function reviewThemeAction(id: string, input: z.input<typeof reviewSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { count } = await db.essayTheme.updateMany({
      where: { id },
      data: { ...parsed.data, reviewedById: admin.id, reviewedAt: new Date() },
    });
    if (count === 0) return fail("Tema não encontrado.");
    revalidateAdmin();
    return ok(null, parsed.data.status === "PUBLISHED" ? "Tema publicado." : parsed.data.status === "REJECTED" ? "Tema rejeitado." : "Tema salvo.");
  });
}

export async function generateThemesAction(competitionId: string, count: number): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    await requireAdmin();
    if (!claudeConfigured()) return fail("Configure ANTHROPIC_API_KEY para gerar temas.");
    const n = z.number().int().min(1).max(8).safeParse(count);
    if (!n.success) return fail("Gere de 1 a 8 temas por vez.");
    const r = await generateThemesNow(competitionId, n.data);
    if (r.reason) return fail(r.reason);
    revalidateAdmin();
    return ok({ created: r.created }, `${r.created} temas gerados como rascunho. Revise antes de publicar.`);
  });
}

export async function submitThemeBatchAction(count: number): Promise<ActionResult<null>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    if (!claudeConfigured()) return fail("Configure ANTHROPIC_API_KEY para gerar temas.");
    const n = z.number().int().min(1).max(8).safeParse(count);
    if (!n.success) return fail("Gere de 1 a 8 temas por concurso.");
    const r = await submitThemeBatch(admin.id, n.data);
    if (!r) return fail("Nenhum concurso tem rubrica publicada.");
    revalidateAdmin();
    return ok(null, `Lote enviado com ${r.requests} concursos. Os resultados chegam em até 24 horas; use “Buscar resultados”.`);
  });
}

export async function collectThemeBatchAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const r = await collectThemeBatch(id);
    revalidateAdmin();
    if (r.status !== "ended" && r.status !== "collected") return ok(null, "O lote ainda está em processamento.");
    return ok(null, `Lote concluído: ${r.created} temas em rascunho${r.failed ? `, ${r.failed} pedidos com falha` : ""}.`);
  });
}
