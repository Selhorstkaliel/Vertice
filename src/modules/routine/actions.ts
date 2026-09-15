"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { weekdayName } from "@/lib/format";
import { ROUTINE_CATEGORY_LABEL } from "@/lib/labels";
import { requireOnboardedUser } from "@/modules/auth/session";
import { updateLearnedEnergy } from "@/modules/adaptation/service";
import { blockSegments as segments, clashMessage, findClash } from "./segments";

const CATEGORIES = Object.keys(ROUTINE_CATEGORY_LABEL) as [keyof typeof ROUTINE_CATEGORY_LABEL, ...(keyof typeof ROUTINE_CATEGORY_LABEL)[]];
const ENERGY = ["VERY_HIGH", "HIGH", "NORMAL", "LOW", "VERY_LOW"] as const;

const blockSchema = z
  .object({
    id: z.string().optional(),
    days: z.array(z.number().int().min(1).max(7)).min(1, "Escolha pelo menos um dia."),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1440),
    category: z.enum(CATEGORIES),
    label: z.string().trim().max(60).optional(),
    isFixed: z.boolean(),
    energy: z.enum(ENERGY).nullable(),
  })
  .refine((v) => v.startMinute !== v.endMinute, { path: ["endMinute"], message: "O fim precisa ser diferente do início." })
  .refine((v) => !v.id || v.days.length === 1, { path: ["days"], message: "Ao editar, escolha apenas um dia." });

export type BlockInput = z.input<typeof blockSchema>;

function revalidateRoutine() {
  revalidatePath("/rotina");
  revalidatePath("/plano");
  revalidatePath("/painel");
}

async function ensureRoutine(userId: string) {
  const existing = await db.routine.findFirst({ where: { userId, isActive: true }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.routine.create({ data: { userId, name: "Rotina principal", isActive: true }, select: { id: true } });
  return created.id;
}

export async function saveRoutineBlockAction(input: BlockInput): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = blockSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const data = parsed.data;
    const routineId = await ensureRoutine(user.id);

    if (data.id) {
      const current = await db.routineBlock.findFirst({ where: { id: data.id, routine: { userId: user.id } }, select: { id: true } });
      if (!current) return fail("Bloco não encontrado.");
    }

    const parts = segments(data.days, data.startMinute, data.endMinute);
    const existing = await db.routineBlock.findMany({
      where: { routineId, dayOfWeek: { in: [...new Set(parts.map((p) => p.dayOfWeek))] }, ...(data.id ? { id: { not: data.id } } : {}) },
      select: { dayOfWeek: true, startMinute: true, endMinute: true, category: true },
    });
    for (const p of parts) {
      const clash = findClash(existing, p);
      if (clash) return fail(clashMessage(clash));
    }

    const common = {
      category: data.category,
      label: data.label || null,
      isFixed: data.isFixed,
      energy: data.category === "STUDY" || data.category === "FREE" ? data.energy : null,
    };

    await db.$transaction(async (tx) => {
      if (data.id) {
        const [first, ...rest] = parts;
        await tx.routineBlock.update({ where: { id: data.id }, data: { ...common, ...first! } });
        if (rest.length) await tx.routineBlock.createMany({ data: rest.map((p) => ({ routineId, ...common, ...p })) });
      } else {
        await tx.routineBlock.createMany({ data: parts.map((p) => ({ routineId, ...common, ...p })) });
      }
    });

    revalidateRoutine();
    return ok({ created: parts.length }, data.id ? "Bloco atualizado." : parts.length > 1 ? `${parts.length} blocos adicionados.` : "Bloco adicionado.");
  });
}

export async function deleteRoutineBlockAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.routineBlock.deleteMany({ where: { id, routine: { userId: user.id } } });
    if (count === 0) return fail("Bloco não encontrado.");
    revalidateRoutine();
    return ok(null, "Bloco removido.");
  });
}

export async function copyDayAction(fromDay: number, toDays: number[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const schema = z.object({ from: z.number().int().min(1).max(7), to: z.array(z.number().int().min(1).max(7)).min(1) });
    const parsed = schema.safeParse({ from: fromDay, to: toDays.filter((d) => d !== fromDay) });
    if (!parsed.success) return fail("Escolha os dias de destino.");
    const routineId = await ensureRoutine(user.id);
    const source = await db.routineBlock.findMany({ where: { routineId, dayOfWeek: parsed.data.from } });
    await db.$transaction([
      db.routineBlock.deleteMany({ where: { routineId, dayOfWeek: { in: parsed.data.to } } }),
      db.routineBlock.createMany({
        data: parsed.data.to.flatMap((d) =>
          source.map((b) => ({
            routineId,
            dayOfWeek: d,
            startMinute: b.startMinute,
            endMinute: b.endMinute,
            category: b.category,
            label: b.label,
            isFixed: b.isFixed,
            energy: b.energy,
            notes: b.notes,
          })),
        ),
      }),
    ]);
    revalidateRoutine();
    return ok(null, `Rotina de ${weekdayName(parsed.data.from).toLowerCase()} copiada.`);
  });
}

export async function setEnergyAction(period: "DAWN" | "MORNING" | "AFTERNOON" | "EVENING", level: (typeof ENERGY)[number]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = z.object({ period: z.enum(["DAWN", "MORNING", "AFTERNOON", "EVENING"]), level: z.enum(ENERGY) }).safeParse({ period, level });
    if (!parsed.success) return fail("Valor inválido.");
    await db.energyPeriod.upsert({
      where: { userId_period: { userId: user.id, period: parsed.data.period } },
      update: { level: parsed.data.level },
      create: { userId: user.id, period: parsed.data.period, level: parsed.data.level },
    });
    revalidateRoutine();
    return ok(null, "Energia atualizada.");
  });
}

export async function setEnergyLearningAction(enabled: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (typeof enabled !== "boolean") return fail("Valor inválido.");
    await db.$transaction([
      db.profile.update({ where: { userId: user.id }, data: { energyLearning: enabled } }),
      // Turning learning off removes its effect right away; turning it on recomputes on the next daily pass.
      ...(enabled ? [] : [db.energyPeriod.updateMany({ where: { userId: user.id }, data: { learnedDelta: 0, learnedEvidence: Prisma.DbNull, learnedAt: null } })]),
    ]);
    if (enabled) await updateLearnedEnergy(user.id, user.profile.timezone);
    revalidateRoutine();
    return ok(null, enabled ? "Ajuste pela performance real ativado." : "Ajuste pela performance real desativado. Os níveis voltam a ser só os que você informou.");
  });
}
