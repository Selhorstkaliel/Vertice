"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, type ActionResult } from "@/lib/action";
import { isDateKey, keyToDbDate } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { requireUser } from "@/modules/auth/session";
import { DEFAULT_ENERGY } from "@/engines/routine/availability";
import { visibleCompetition } from "@/modules/competitions/queries";

const schema = z
  .object({
    track: z.enum(["PUBLIC", "MILITARY", "BOTH"]),
    competitionId: z.string().optional(),
    customCompetition: z
      .object({
        name: z.string().trim().min(2, "Informe o nome do concurso.").max(80),
        organization: z.string().trim().min(2, "Informe o órgão.").max(120),
        kind: z.enum(["PUBLIC", "MILITARY"]),
      })
      .optional(),
    examDate: z.string().nullable().refine((v) => v === null || isDateKey(v), "Data inválida."),
    weeklyHours: z.number({ invalid_type_error: "Informe as horas semanais." }).min(1, "Mínimo de 1 hora.").max(80, "Máximo de 80 horas."),
    hardSubjectIds: z.array(z.string()).max(30),
    works: z.boolean(),
    studiesCollege: z.boolean(),
    physicalPrep: z.boolean(),
    goal: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.competitionId || v.customCompetition, {
    path: ["competitionId"],
    message: "Escolha seu concurso principal.",
  });

export type OnboardingInput = z.input<typeof schema>;

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionResult<never>> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const data = parsed.data;

  if (data.examDate && keyToDbDate(data.examDate).getTime() < Date.now() - 86_400_000) {
    return fail("A data da prova já passou.", { examDate: ["Escolha uma data futura."] });
  }

  let competitionId = data.competitionId;
  if (competitionId) {
    const visible = await db.competition.findFirst({ where: { AND: [{ id: competitionId }, visibleCompetition(user.id)] }, select: { id: true } });
    if (!visible) return fail("Concurso não encontrado.");
  }

  const hardSubjects = data.hardSubjectIds.length
    ? await db.subject.findMany({
        where: { id: { in: data.hardSubjectIds }, OR: [{ ownerId: null }, { ownerId: user.id }] },
        select: { id: true },
      })
    : [];

  await db.$transaction(async (tx) => {
    if (!competitionId && data.customCompetition) {
      const c = data.customCompetition;
      const created = await tx.competition.create({
        data: {
          slug: `u-${slugify(c.name)}-${randomBytes(4).toString("hex")}`,
          name: c.name,
          organization: c.organization,
          kind: c.kind,
          ownerId: user.id,
          verification: "USER_PROVIDED",
          sourceNote: "Concurso cadastrado por você.",
        },
        select: { id: true },
      });
      competitionId = created.id;
    }
    const cid = competitionId!;

    await tx.studentCompetition.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: cid },
      select: { examDate: true, stages: { orderBy: { order: "asc" } } },
    });
    const enrollment = await tx.studentCompetition.upsert({
      where: { userId_competitionId: { userId: user.id, competitionId: cid } },
      update: {
        isPrimary: true,
        status: "ACTIVE",
        customExamDate: competition.examDate ? null : data.examDate ? keyToDbDate(data.examDate) : null,
      },
      create: {
        userId: user.id,
        competitionId: cid,
        isPrimary: true,
        customExamDate: competition.examDate ? null : data.examDate ? keyToDbDate(data.examDate) : null,
      },
      select: { id: true, _count: { select: { stages: true } } },
    });
    if (enrollment._count.stages === 0 && competition.stages.length) {
      await tx.studentStage.createMany({
        data: competition.stages.map((s) => ({ studentCompetitionId: enrollment.id, name: s.name, order: s.order })),
      });
    }

    await tx.profile.upsert({
      where: { userId: user.id },
      update: {
        track: data.track,
        weeklyHoursTarget: data.weeklyHours,
        works: data.works,
        studiesCollege: data.studiesCollege,
        physicalPrep: data.physicalPrep,
        goal: data.goal || null,
        hardSubjects: { set: hardSubjects },
      },
      create: {
        userId: user.id,
        track: data.track,
        weeklyHoursTarget: data.weeklyHours,
        works: data.works,
        studiesCollege: data.studiesCollege,
        physicalPrep: data.physicalPrep,
        goal: data.goal || null,
        hardSubjects: { connect: hardSubjects },
      },
    });

    await tx.energyPeriod.createMany({
      data: DEFAULT_ENERGY.map((e) => ({ userId: user.id, period: e.period, level: e.level })),
      skipDuplicates: true,
    });

    const routine = await tx.routine.findFirst({ where: { userId: user.id, isActive: true }, select: { id: true } });
    if (!routine) await tx.routine.create({ data: { userId: user.id, name: "Rotina principal", isActive: true } });

    await tx.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  });

  // The optional diagnostic comes first; skipping it leads to the routine.
  redirect("/diagnostico?inicio=1");
}
