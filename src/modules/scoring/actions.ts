"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { ruleSubjectsSchema } from "@/engines/simulations/scoring";
import { requireAdmin } from "@/modules/auth/admin";

const optionalNumber = (schema: z.ZodNumber) => z.preprocess((v) => (v === "" || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : v), schema.nullable());

const ruleSchema = z
  .object({
    id: z.string().optional(),
    competitionId: z.string().min(1, "Escolha o concurso."),
    year: optionalNumber(z.number().int().min(1990).max(2100)),
    mode: z.enum(["RIGHT_COUNT", "PENALTY"]),
    wrongPenalty: optionalNumber(z.number().min(0).max(10)),
    durationMinutes: optionalNumber(z.number().int().min(10).max(900)),
    subjects: ruleSubjectsSchema,
    minTotalShare: optionalNumber(z.number().min(0).max(1)),
    cutoffScore: optionalNumber(z.number().min(-1000).max(100000)),
    maxScore: optionalNumber(z.number().positive().max(100000)),
    sourceUrl: z.preprocess((v) => (v === "" ? null : v), z.string().url("Link inválido.").max(500).nullable()),
    sourceNote: z.string().trim().max(500).optional(),
    verified: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "PENALTY" && v.wrongPenalty === null) ctx.addIssue({ code: "custom", path: ["wrongPenalty"], message: "Informe quantos acertos cada erro anula." });
    if (v.cutoffScore !== null && v.maxScore === null) ctx.addIssue({ code: "custom", path: ["maxScore"], message: "A nota de corte precisa da nota máxima da prova." });
    // Nothing is marked as verified without the document it was checked against.
    if (v.verified && !v.sourceUrl) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Para marcar como verificada, informe o link do edital." });
    if (v.verified && v.year === null) ctx.addIssue({ code: "custom", path: ["year"], message: "Informe o ano do edital verificado." });
  });

export type ScoringRuleFormInput = z.input<typeof ruleSchema>;

function revalidateRules() {
  revalidatePath("/admin/regras");
  revalidatePath("/simulados", "layout");
}

export async function saveScoringRuleAction(input: ScoringRuleFormInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    const competition = await db.competition.findFirst({
      where: { id: d.competitionId, ownerId: null },
      select: { id: true, subjects: { select: { subjectId: true } } },
    });
    if (!competition) return fail("Concurso do catálogo não encontrado.");
    const allowed = new Set(competition.subjects.map((s) => s.subjectId));
    if (d.subjects.some((s) => !allowed.has(s.subjectId))) return fail("Há disciplina que não pertence a este edital.");

    const data = {
      competitionId: d.competitionId,
      year: d.year,
      mode: d.mode,
      wrongPenalty: d.mode === "PENALTY" ? d.wrongPenalty : null,
      durationMinutes: d.durationMinutes,
      subjects: d.subjects,
      minTotalShare: d.minTotalShare,
      cutoffScore: d.cutoffScore,
      maxScore: d.maxScore,
      sourceUrl: d.sourceUrl,
      sourceNote: d.sourceNote || null,
      verification: d.verified ? ("VERIFIED" as const) : ("UNVERIFIED" as const),
    };
    if (d.id) {
      const { count } = await db.scoringRule.updateMany({ where: { id: d.id }, data });
      if (count === 0) return fail("Regra não encontrada.");
      revalidateRules();
      return ok({ id: d.id }, "Regra atualizada.");
    }
    const created = await db.scoringRule.create({ data, select: { id: true } });
    revalidateRules();
    return ok({ id: created.id }, "Regra cadastrada.");
  });
}

export async function deleteScoringRuleAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { count } = await db.scoringRule.deleteMany({ where: { id } });
    if (count === 0) return fail("Regra não encontrada.");
    revalidateRules();
    return ok(null, "Regra removida. Simulados antigos mantêm a nota já calculada.");
  });
}
