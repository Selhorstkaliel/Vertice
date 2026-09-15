"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { isDateKey, keyToDbDate } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { requireOnboardedUser } from "@/modules/auth/session";
import { visibleCompetition } from "./queries";

function revalidateCompetitions(id?: string) {
  revalidatePath("/concursos");
  if (id) revalidatePath(`/concursos/${id}`);
  revalidatePath("/edital");
  revalidatePath("/painel");
  revalidatePath("/plano");
  revalidatePath("/", "layout");
}

const dateOrNull = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || isDateKey(v), "Data inválida.")
  .transform((v) => (v ? keyToDbDate(v) : null));

async function ownedEnrollment(userId: string, enrollmentId: string) {
  return db.studentCompetition.findFirst({
    where: { id: enrollmentId, userId },
    include: { competition: { select: { id: true, ownerId: true, examDate: true, name: true } } },
  });
}

/** Mutations to a competition's structure are only allowed on the user's own copy. */
async function ownedCompetition(userId: string, competitionId: string) {
  return db.competition.findFirst({ where: { id: competitionId, ownerId: userId }, select: { id: true } });
}

export async function enrollCompetitionAction(competitionId: string, makePrimary: boolean): Promise<ActionResult<{ enrollmentId: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const competition = await db.competition.findFirst({
      where: { AND: [{ id: competitionId }, visibleCompetition(user.id)] },
      select: { id: true, stages: { orderBy: { order: "asc" } } },
    });
    if (!competition) return fail("Concurso não encontrado.");

    const existingCount = await db.studentCompetition.count({ where: { userId: user.id, status: { not: "ARCHIVED" } } });
    const primary = makePrimary || existingCount === 0;

    const enrollment = await db.$transaction(async (tx) => {
      if (primary) await tx.studentCompetition.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
      const e = await tx.studentCompetition.upsert({
        where: { userId_competitionId: { userId: user.id, competitionId } },
        update: { status: "ACTIVE", isPrimary: primary },
        create: { userId: user.id, competitionId, isPrimary: primary },
        select: { id: true, _count: { select: { stages: true } } },
      });
      if (e._count.stages === 0 && competition.stages.length) {
        await tx.studentStage.createMany({
          data: competition.stages.map((s) => ({ studentCompetitionId: e.id, name: s.name, order: s.order })),
        });
      }
      return e;
    });
    revalidateCompetitions(competitionId);
    return ok({ enrollmentId: enrollment.id }, primary ? "Concurso adicionado como principal." : "Concurso adicionado como secundário.");
  });
}

export async function setPrimaryEnrollmentAction(enrollmentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const e = await ownedEnrollment(user.id, enrollmentId);
    if (!e) return fail("Concurso não encontrado.");
    await db.$transaction([
      db.studentCompetition.updateMany({ where: { userId: user.id }, data: { isPrimary: false } }),
      db.studentCompetition.update({ where: { id: e.id }, data: { isPrimary: true, status: "ACTIVE" } }),
    ]);
    revalidateCompetitions(e.competitionId);
    return ok(null, `${e.competition.name} agora é o concurso principal.`);
  });
}

const enrollmentSchema = z.object({
  customExamDate: dateOrNull,
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
  notes: z.string().max(1000).optional(),
});

export async function updateEnrollmentAction(enrollmentId: string, input: z.input<typeof enrollmentSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = enrollmentSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const e = await ownedEnrollment(user.id, enrollmentId);
    if (!e) return fail("Concurso não encontrado.");
    if (e.isPrimary && parsed.data.status !== "ACTIVE") return fail("Defina outro concurso principal antes de pausar ou arquivar este.");
    await db.studentCompetition.update({
      where: { id: e.id },
      data: {
        // Official dates take precedence and cannot be overridden.
        customExamDate: e.competition.examDate ? null : parsed.data.customExamDate,
        status: parsed.data.status,
        notes: parsed.data.notes?.trim() || null,
      },
    });
    revalidateCompetitions(e.competitionId);
    return ok(null, "Concurso atualizado.");
  });
}

export async function removeEnrollmentAction(enrollmentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const e = await ownedEnrollment(user.id, enrollmentId);
    if (!e) return fail("Concurso não encontrado.");
    await db.$transaction(async (tx) => {
      await tx.studentCompetition.delete({ where: { id: e.id } });
      if (e.isPrimary) {
        const next = await tx.studentCompetition.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
        if (next) await tx.studentCompetition.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      // A private competition without enrollment has no further use.
      if (e.competition.ownerId === user.id) await tx.competition.delete({ where: { id: e.competitionId } });
    });
    revalidateCompetitions();
    return ok(null, "Concurso removido. Seu progresso nos tópicos foi mantido.");
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  organization: z.string().trim().min(2, "Informe o órgão.").max(120),
  position: z.string().trim().max(120).optional(),
  kind: z.enum(["PUBLIC", "MILITARY"]),
  examBoardId: z.string().optional(),
  year: z.number().int().min(2000).max(2100).nullable(),
  examDate: dateOrNull,
  editalUrl: z.string().trim().url("Informe um link válido.").max(500).optional().or(z.literal("")),
  status: z.enum(["EXPECTED", "EDITAL_PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "EXAM_DONE", "CONCLUDED"]),
});

export type CompetitionInput = z.input<typeof createSchema>;

export async function createCompetitionAction(input: CompetitionInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireOnboardedUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  if (d.examBoardId && !(await db.examBoard.findUnique({ where: { id: d.examBoardId }, select: { id: true } }))) {
    return fail("Banca inválida.");
  }
  const primaryExists = await db.studentCompetition.count({ where: { userId: user.id, isPrimary: true } });
  const created = await db.competition.create({
    data: {
      slug: `u-${slugify(d.name)}-${randomBytes(4).toString("hex")}`,
      name: d.name,
      organization: d.organization,
      position: d.position || null,
      kind: d.kind,
      examBoardId: d.examBoardId || null,
      year: d.year,
      examDate: d.examDate,
      editalUrl: d.editalUrl || null,
      status: d.status,
      ownerId: user.id,
      verification: "USER_PROVIDED",
      sourceNote: "Concurso cadastrado por você.",
      enrollments: { create: { userId: user.id, isPrimary: primaryExists === 0 } },
    },
    select: { id: true },
  });
  revalidateCompetitions();
  redirect(`/concursos/${created.id}`);
}

export async function updateOwnedCompetitionAction(competitionId: string, input: CompetitionInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Somente concursos cadastrados ou personalizados por você podem ser editados.");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    await db.competition.update({
      where: { id: competitionId },
      data: {
        name: d.name,
        organization: d.organization,
        position: d.position || null,
        kind: d.kind,
        examBoardId: d.examBoardId || null,
        year: d.year,
        examDate: d.examDate,
        editalUrl: d.editalUrl || null,
        status: d.status,
        verification: "USER_PROVIDED",
      },
    });
    revalidateCompetitions(competitionId);
    return ok(null, "Dados do concurso salvos.");
  });
}

/**
 * Creates a private, editable copy of a catalog competition and moves the
 * enrollment to it. Topics are shared, so all progress carries over.
 */
export async function customizeEditalAction(enrollmentId: string): Promise<ActionResult<{ competitionId: string }>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const e = await ownedEnrollment(user.id, enrollmentId);
    if (!e) return fail("Concurso não encontrado.");
    if (e.competition.ownerId === user.id) return ok({ competitionId: e.competitionId }, "Este edital já é editável.");

    const source = await db.competition.findUniqueOrThrow({
      where: { id: e.competitionId },
      include: { subjects: true, topics: true, stages: true },
    });

    const copy = await db.$transaction(async (tx) => {
      const c = await tx.competition.create({
        data: {
          slug: `u-${source.slug}-${randomBytes(4).toString("hex")}`,
          name: source.name,
          organization: source.organization,
          position: source.position,
          kind: source.kind,
          examBoardId: source.examBoardId,
          year: source.year,
          examDate: source.examDate,
          editalUrl: source.editalUrl,
          status: source.status,
          verification: source.verification,
          sourceNote: "Cópia personalizada a partir do catálogo do Vértice.",
          ownerId: user.id,
          forkedFromId: source.id,
        },
      });
      await tx.competitionSubject.createMany({
        data: source.subjects.map((s) => ({
          competitionId: c.id,
          subjectId: s.subjectId,
          weight: s.weight,
          questionCount: s.questionCount,
          order: s.order,
          verification: s.verification,
        })),
      });
      await tx.competitionTopic.createMany({
        data: source.topics.map((t) => ({ competitionId: c.id, topicId: t.topicId, incidence: t.incidence, verification: t.verification })),
      });
      await tx.competitionStage.createMany({
        data: source.stages.map((s) => ({ competitionId: c.id, name: s.name, order: s.order, description: s.description })),
      });
      await tx.studentCompetition.update({ where: { id: e.id }, data: { competitionId: c.id } });
      await tx.studyPlanItem.updateMany({ where: { userId: user.id, competitionId: source.id }, data: { competitionId: c.id } });
      return c;
    });
    revalidateCompetitions(copy.id);
    return ok({ competitionId: copy.id }, "Edital personalizado. Agora você pode ajustar disciplinas, pesos e tópicos.");
  });
}

export async function addSubjectAction(competitionId: string, input: { subjectId?: string; newSubjectName?: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Personalize o edital para adicionar disciplinas.");

    let subjectId = input.subjectId;
    if (!subjectId) {
      const name = z.string().trim().min(2).max(80).safeParse(input.newSubjectName);
      if (!name.success) return fail("Informe o nome da disciplina.");
      const slug = slugify(name.data);
      const existing = await db.subject.findFirst({ where: { slug, OR: [{ ownerId: null }, { ownerId: user.id }] } });
      subjectId = existing?.id ?? (await db.subject.create({ data: { slug, name: name.data, ownerId: user.id, area: null } })).id;
    } else {
      const visible = await db.subject.findFirst({ where: { id: subjectId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true } });
      if (!visible) return fail("Disciplina não encontrada.");
    }

    const already = await db.competitionSubject.findUnique({ where: { competitionId_subjectId: { competitionId, subjectId } } });
    if (already) return fail("Essa disciplina já faz parte do edital.");

    const [count, topics] = await Promise.all([
      db.competitionSubject.count({ where: { competitionId } }),
      db.topic.findMany({ where: { subjectId, OR: [{ ownerId: null }, { ownerId: user.id }] }, select: { id: true } }),
    ]);
    await db.$transaction([
      db.competitionSubject.create({ data: { competitionId, subjectId, order: count, verification: "USER_PROVIDED" } }),
      db.competitionTopic.createMany({
        data: topics.map((t) => ({ competitionId, topicId: t.id, verification: "USER_PROVIDED" as const })),
        skipDuplicates: true,
      }),
    ]);
    revalidateCompetitions(competitionId);
    return ok(null, topics.length ? `Disciplina adicionada com ${topics.length} tópicos de referência.` : "Disciplina adicionada.");
  });
}

export async function removeSubjectAction(competitionId: string, subjectId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Personalize o edital para remover disciplinas.");
    await db.$transaction([
      db.competitionTopic.deleteMany({ where: { competitionId, topic: { subjectId } } }),
      db.competitionSubject.deleteMany({ where: { competitionId, subjectId } }),
    ]);
    revalidateCompetitions(competitionId);
    return ok(null, "Disciplina removida do edital. Seu histórico foi mantido.");
  });
}

const weightSchema = z.object({
  weight: z.number().min(0.1).max(100).nullable(),
  questionCount: z.number().int().min(0).max(500).nullable(),
});

export async function setSubjectWeightAction(competitionId: string, subjectId: string, input: z.input<typeof weightSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Personalize o edital para definir pesos.");
    const parsed = weightSchema.safeParse(input);
    if (!parsed.success) return fail("Peso ou quantidade inválidos.");
    const { count } = await db.competitionSubject.updateMany({
      where: { competitionId, subjectId },
      data: { weight: parsed.data.weight, questionCount: parsed.data.questionCount, verification: "USER_PROVIDED" },
    });
    if (count === 0) return fail("Disciplina não encontrada no edital.");
    revalidateCompetitions(competitionId);
    return ok(null, "Peso salvo.");
  });
}

export async function addTopicAction(
  competitionId: string,
  input: { subjectId: string; name: string; parentId?: string | null },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Personalize o edital para adicionar tópicos.");
    const name = z.string().trim().min(2, "Informe o nome do tópico.").max(120).safeParse(input.name);
    if (!name.success) return fail(name.error.issues[0]?.message ?? "Nome inválido.");
    const link = await db.competitionSubject.findUnique({ where: { competitionId_subjectId: { competitionId, subjectId: input.subjectId } } });
    if (!link) return fail("Disciplina não faz parte do edital.");
    if (input.parentId) {
      const parent = await db.competitionTopic.findFirst({ where: { competitionId, topicId: input.parentId, topic: { subjectId: input.subjectId } } });
      if (!parent) return fail("Tópico pai inválido.");
    }
    const order = await db.topic.count({ where: { subjectId: input.subjectId, parentId: input.parentId ?? null } });
    const topic = await db.topic.create({
      data: {
        subjectId: input.subjectId,
        parentId: input.parentId ?? null,
        name: name.data,
        slug: `${slugify(name.data)}-${randomBytes(3).toString("hex")}`,
        order,
        ownerId: user.id,
      },
    });
    await db.competitionTopic.create({ data: { competitionId, topicId: topic.id, verification: "USER_PROVIDED" } });
    revalidateCompetitions(competitionId);
    return ok(null, "Tópico adicionado.");
  });
}

export async function removeTopicAction(competitionId: string, topicId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (!(await ownedCompetition(user.id, competitionId))) return fail("Personalize o edital para remover tópicos.");
    const children = await db.topic.findMany({ where: { parentId: topicId }, select: { id: true } });
    await db.competitionTopic.deleteMany({ where: { competitionId, topicId: { in: [topicId, ...children.map((c) => c.id)] } } });
    revalidateCompetitions(competitionId);
    return ok(null, "Tópico removido do edital.");
  });
}

const stageSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "PASSED", "FAILED", "NOT_APPLICABLE"]),
  date: dateOrNull,
  notes: z.string().max(500).optional(),
});

export async function updateStageAction(stageId: string, input: z.input<typeof stageSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = stageSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const stage = await db.studentStage.findFirst({ where: { id: stageId, enrollment: { userId: user.id } }, select: { id: true, enrollment: { select: { competitionId: true } } } });
    if (!stage) return fail("Etapa não encontrada.");
    await db.studentStage.update({ where: { id: stageId }, data: { status: parsed.data.status, date: parsed.data.date, notes: parsed.data.notes?.trim() || null } });
    revalidateCompetitions(stage.enrollment.competitionId);
    revalidatePath("/militar");
    revalidatePath("/calendario");
    return ok(null, "Etapa atualizada.");
  });
}

export async function addStageAction(enrollmentId: string, name: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsedName = z.string().trim().min(2, "Informe o nome da etapa.").max(80).safeParse(name);
    if (!parsedName.success) return fail(parsedName.error.issues[0]?.message ?? "Nome inválido.");
    const e = await ownedEnrollment(user.id, enrollmentId);
    if (!e) return fail("Concurso não encontrado.");
    const order = await db.studentStage.count({ where: { studentCompetitionId: e.id } });
    await db.studentStage.create({ data: { studentCompetitionId: e.id, name: parsedName.data, order } });
    revalidateCompetitions(e.competitionId);
    revalidatePath("/militar");
    return ok(null, "Etapa adicionada.");
  });
}

export async function removeStageAction(stageId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const stage = await db.studentStage.findFirst({ where: { id: stageId, enrollment: { userId: user.id } }, select: { id: true, enrollment: { select: { competitionId: true } } } });
    if (!stage) return fail("Etapa não encontrada.");
    await db.studentStage.delete({ where: { id: stageId } });
    revalidateCompetitions(stage.enrollment.competitionId);
    revalidatePath("/militar");
    return ok(null, "Etapa removida.");
  });
}

export async function moveStageAction(stageId: string, direction: "up" | "down"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const stage = await db.studentStage.findFirst({ where: { id: stageId, enrollment: { userId: user.id } } });
    if (!stage) return fail("Etapa não encontrada.");
    const stages = await db.studentStage.findMany({ where: { studentCompetitionId: stage.studentCompetitionId }, orderBy: { order: "asc" } });
    const index = stages.findIndex((s) => s.id === stageId);
    const swapWith = stages[direction === "up" ? index - 1 : index + 1];
    if (!swapWith) return ok(null);
    const reordered = [...stages];
    reordered[index] = swapWith;
    reordered[direction === "up" ? index - 1 : index + 1] = stage;
    await db.$transaction(reordered.map((s, order) => db.studentStage.update({ where: { id: s.id }, data: { order } })));
    revalidatePath("/militar");
    revalidatePath("/concursos", "layout");
    return ok(null);
  });
}
