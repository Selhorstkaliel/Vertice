"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { isDateKey, keyToDbDate, localNow } from "@/lib/time";
import { requireOnboardedUser } from "@/modules/auth/session";
import { parseMeasure } from "@/engines/military/taf";

const UNITS = ["SECONDS", "REPS", "METERS", "KILOGRAMS"] as const;
const MODALITIES = ["RUN", "PULL_UP", "PUSH_UP", "SIT_UP", "SWIM", "OTHER"] as const;

function revalidate() {
  revalidatePath("/militar");
  revalidatePath("/calendario");
}

const testSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome da prova.").max(60, "Nome longo demais."),
    modality: z.enum(MODALITIES),
    unit: z.enum(UNITS),
    betterWhen: z.enum(["LOWER", "HIGHER"]),
    distanceMeters: z.number().int().min(1, "Distância inválida.").max(100_000, "Distância inválida.").nullable(),
    target: z.string().trim().max(20),
    enrollmentId: z.string().max(40).nullable().transform((v) => v || null),
    notes: z.string().trim().max(500).optional(),
  })
  .transform((v, ctx) => {
    const targetValue = v.target ? parseMeasure(v.target, v.unit) : null;
    if (v.target && targetValue === null) {
      ctx.addIssue({ code: "custom", path: ["target"], message: v.unit === "SECONDS" ? "Use minutos e segundos, como 12:00." : "Informe um número positivo." });
      return z.NEVER;
    }
    return { ...v, targetValue };
  });

export type TafTestInput = z.input<typeof testSchema>;

async function checkEnrollment(userId: string, enrollmentId: string | null) {
  if (!enrollmentId) return true;
  return !!(await db.studentCompetition.findFirst({ where: { id: enrollmentId, userId }, select: { id: true } }));
}

export async function saveTafTestAction(id: string | null, input: TafTestInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = testSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    if (!(await checkEnrollment(user.id, d.enrollmentId))) return fail("Concurso não encontrado.");
    const data = {
      name: d.name,
      modality: d.modality,
      unit: d.unit,
      betterWhen: d.betterWhen,
      distanceMeters: d.distanceMeters,
      targetValue: d.targetValue,
      studentCompetitionId: d.enrollmentId,
      notes: d.notes || null,
    };
    if (id) {
      const existing = await db.militaryTest.findFirst({ where: { id, userId: user.id }, select: { unit: true, _count: { select: { results: true } } } });
      if (!existing) return fail("Prova não encontrada.");
      if (existing.unit !== d.unit && existing._count.results > 0) return fail("Não é possível mudar a unidade de uma prova que já tem resultados.");
      await db.militaryTest.update({ where: { id }, data });
      revalidate();
      return ok({ id }, "Prova atualizada.");
    }
    const created = await db.militaryTest.create({ data: { userId: user.id, ...data }, select: { id: true } });
    revalidate();
    return ok(created, "Prova adicionada.");
  });
}

export async function deleteTafTestAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.militaryTest.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return fail("Prova não encontrada.");
    revalidate();
    return ok(null, "Prova e resultados removidos.");
  });
}

const resultSchema = z.object({
  testId: z.string().max(40),
  value: z.string().trim().min(1, "Informe o resultado.").max(20),
  date: z.string().refine(isDateKey, "Data inválida."),
  notes: z.string().trim().max(300).optional(),
});

export async function addTafResultAction(input: z.input<typeof resultSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = resultSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const test = await db.militaryTest.findFirst({ where: { id: parsed.data.testId, userId: user.id }, select: { id: true, unit: true } });
    if (!test) return fail("Prova não encontrada.");
    const value = parseMeasure(parsed.data.value, test.unit);
    if (value === null) {
      return fail(test.unit === "SECONDS" ? "Resultado inválido. Use minutos e segundos, como 13:20." : test.unit === "REPS" ? "Informe um número inteiro de repetições." : "Informe um número positivo.", {
        value: ["Valor inválido."],
      });
    }
    if (parsed.data.date > localNow(user.profile.timezone).key) return fail("A data não pode estar no futuro.", { date: ["Data futura."] });
    await db.militaryTestResult.create({
      data: { testId: test.id, userId: user.id, value, recordedAt: keyToDbDate(parsed.data.date), notes: parsed.data.notes || null },
    });
    revalidate();
    return ok(null, "Resultado registrado.");
  });
}

export async function deleteTafResultAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.militaryTestResult.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return fail("Resultado não encontrado.");
    revalidate();
    return ok(null, "Resultado removido.");
  });
}
