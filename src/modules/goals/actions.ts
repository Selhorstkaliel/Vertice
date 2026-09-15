"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { requireOnboardedUser } from "@/modules/auth/session";
import { visibleSubject } from "@/modules/competitions/queries";
import { MAX_ACTIVE_GOALS, SUBJECT_KINDS } from "./service";

const KINDS = ["HOURS", "QUESTIONS", "TOPICS", "FLASHCARDS", "SIMULATIONS", "REVIEWS"] as const;

const goalSchema = z
  .object({
    kind: z.enum(KINDS),
    period: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    target: z.number({ invalid_type_error: "Informe a meta." }).positive("A meta precisa ser maior que zero.").max(10_000, "Meta alta demais."),
    subjectId: z.string().max(40).nullable().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "HOURS") {
      if (Math.round(v.target * 2) !== v.target * 2) ctx.addIssue({ code: "custom", path: ["target"], message: "Use horas inteiras ou meias horas, como 1,5." });
      const max = v.period === "DAILY" ? 16 : v.period === "WEEKLY" ? 100 : 400;
      if (v.target > max) ctx.addIssue({ code: "custom", path: ["target"], message: `No máximo ${max} horas neste período.` });
    } else if (!Number.isInteger(v.target)) {
      ctx.addIssue({ code: "custom", path: ["target"], message: "Use um número inteiro." });
    }
    if (v.subjectId && !SUBJECT_KINDS.includes(v.kind)) ctx.addIssue({ code: "custom", path: ["subjectId"], message: "Este tipo de meta não é separado por disciplina." });
  });

export type GoalInput = z.input<typeof goalSchema>;

function revalidate() {
  revalidatePath("/metas");
  revalidatePath("/painel");
  revalidatePath("/perfil");
  revalidatePath("/calendario");
}

export async function saveGoalAction(id: string | null, input: GoalInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = goalSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    if (d.subjectId && !(await db.subject.findFirst({ where: { id: d.subjectId, ...visibleSubject(user.id) }, select: { id: true } }))) {
      return fail("Disciplina não encontrada.");
    }
    const duplicate = await db.goal.findFirst({
      where: { userId: user.id, isActive: true, kind: d.kind, period: d.period, subjectId: d.subjectId, ...(id ? { id: { not: id } } : {}) },
      select: { id: true },
    });
    if (duplicate) return fail("Você já tem uma meta ativa igual. Edite a existente.");

    if (id) {
      const { count } = await db.goal.updateMany({ where: { id, userId: user.id }, data: d });
      if (count === 0) return fail("Meta não encontrada.");
      revalidate();
      return ok(null, "Meta atualizada.");
    }
    if ((await db.goal.count({ where: { userId: user.id, isActive: true } })) >= MAX_ACTIVE_GOALS) {
      return fail(`Limite de ${MAX_ACTIVE_GOALS} metas ativas. Pause ou exclua uma meta antes de criar outra.`);
    }
    await db.goal.create({ data: { userId: user.id, ...d } });
    revalidate();
    return ok(null, "Meta criada.");
  });
}

export async function setGoalActiveAction(id: string, active: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const goal = await db.goal.findFirst({ where: { id, userId: user.id } });
    if (!goal) return fail("Meta não encontrada.");
    if (active) {
      if ((await db.goal.count({ where: { userId: user.id, isActive: true } })) >= MAX_ACTIVE_GOALS) return fail(`Limite de ${MAX_ACTIVE_GOALS} metas ativas.`);
      const duplicate = await db.goal.findFirst({ where: { userId: user.id, isActive: true, kind: goal.kind, period: goal.period, subjectId: goal.subjectId }, select: { id: true } });
      if (duplicate) return fail("Já existe uma meta ativa igual.");
    }
    await db.goal.update({ where: { id }, data: { isActive: active } });
    revalidate();
    return ok(null, active ? "Meta retomada." : "Meta pausada.");
  });
}

export async function deleteGoalAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.goal.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return fail("Meta não encontrada.");
    revalidate();
    return ok(null, "Meta excluída.");
  });
}
