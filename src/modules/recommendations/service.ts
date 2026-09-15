import "server-only";
import type { AiRecommendation, Prisma, RecommendationSource, RoutineCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { formatClock, formatDayKey, formatMinutes, plural, weekdayName } from "@/lib/format";
import { applyRecommendation as applyReplan, undoRecommendation as undoReplan } from "@/modules/plan/service";
import { blockDisplayName, blockSegments, clashMessage, findClash, formatDays } from "@/modules/routine/segments";

/*
 * Recommendations are proposals: nothing here runs until the student accepts.
 * Each kind stores a machine-applicable change set (`proposedChanges`) and,
 * once applied, what is needed to undo it (`previousState`).
 */

export interface RoutineAddChange {
  key: string;
  op: "add";
  days: number[];
  startMinute: number;
  endMinute: number;
  category: RoutineCategory;
  label: string | null;
  isFixed: boolean;
}

export interface RoutineRemoveChange {
  key: string;
  op: "remove";
  blockId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  category: RoutineCategory;
  label: string | null;
}

export type RoutineChange = RoutineAddChange | RoutineRemoveChange;

export const GOAL_FIELDS = {
  weeklyHoursTarget: { label: "Meta semanal de estudo", min: 1, max: 80, format: (v: number | null) => (v === null ? "Sem meta" : formatMinutes(v * 60)) },
  dailyStudyLimitMin: { label: "Limite diário de estudo", min: 30, max: 720, format: (v: number | null) => (v === null ? "—" : formatMinutes(v)) },
  maxSessionMin: { label: "Duração máxima da sessão", min: 20, max: 240, format: (v: number | null) => (v === null ? "—" : formatMinutes(v)) },
} as const;

export type GoalField = keyof typeof GOAL_FIELDS;

export interface GoalChange {
  key: GoalField;
  op: "set";
  field: GoalField;
  from: number | null;
  to: number;
}

export interface RecommendationItemView {
  key: string;
  op: "add" | "remove" | "move" | "set";
  label: string;
  before: string | null;
  after: string | null;
}

export interface RecommendationCardView {
  id: string;
  kind: AiRecommendation["kind"];
  source: RecommendationSource;
  status: AiRecommendation["status"];
  title: string;
  body: string;
  reason: string;
  createdAt: string;
  decidedAt: string | null;
  items: RecommendationItemView[];
  dropped: string[];
  undoable: boolean;
  href: string;
}

const APPLIED = ["ACCEPTED", "EDITED", "AUTO_APPLIED"] as const;

const blockName = blockDisplayName;
const span = (start: number, end: number) => `${formatClock(start)} às ${formatClock(end === 1440 ? 0 : end)}`;

type MoveLike = { itemId: string; label: string; from: { dateKey: string; startMinute: number }; to: { dateKey: string; startMinute: number } };

export function toCardView(r: AiRecommendation): RecommendationCardView {
  const base = {
    id: r.id,
    kind: r.kind,
    source: r.source,
    status: r.status,
    title: r.title,
    body: r.body,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    undoable: (APPLIED as readonly string[]).includes(r.status),
  };

  if (r.kind === "REPLAN") {
    const c = (r.proposedChanges ?? {}) as { moves?: MoveLike[]; dropped?: { label: string }[] };
    const when = (s: { dateKey: string; startMinute: number }) => `${formatDayKey(s.dateKey, "short")}, ${formatClock(s.startMinute)}`;
    return {
      ...base,
      href: "/plano",
      items: (c.moves ?? []).map((m) => ({ key: m.itemId, op: "move", label: m.label, before: when(m.from), after: when(m.to) })),
      dropped: (c.dropped ?? []).map((d) => d.label),
    };
  }

  if (r.kind === "ROUTINE_ADJUSTMENT") {
    const c = (r.proposedChanges ?? {}) as { changes?: RoutineChange[] };
    return {
      ...base,
      href: "/rotina",
      items: (c.changes ?? []).map((ch) =>
        ch.op === "add"
          ? { key: ch.key, op: "add", label: blockName(ch.category, ch.label), before: null, after: `${formatDays(ch.days)}, ${span(ch.startMinute, ch.endMinute)}` }
          : { key: ch.key, op: "remove", label: blockName(ch.category, ch.label), before: `${weekdayName(ch.dayOfWeek).toLowerCase()}, ${span(ch.startMinute, ch.endMinute)}`, after: null },
      ),
      dropped: [],
    };
  }

  if (r.kind === "GOAL_ADJUSTMENT") {
    const c = (r.proposedChanges ?? {}) as { changes?: GoalChange[] };
    return {
      ...base,
      href: "/rotina",
      items: (c.changes ?? []).map((ch) => ({
        key: ch.key,
        op: "set",
        label: GOAL_FIELDS[ch.field].label,
        before: GOAL_FIELDS[ch.field].format(ch.from),
        after: GOAL_FIELDS[ch.field].format(ch.to),
      })),
      dropped: [],
    };
  }

  return { ...base, href: "/plano", items: [], dropped: [] };
}

export async function getRecommendationViews(userId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, RecommendationCardView>();
  const rows = await db.aiRecommendation.findMany({ where: { userId, id: { in: ids } } });
  return new Map(rows.map((r) => [r.id, toCardView(r)]));
}

/** Pending proposals plus recent decisions that can still be undone. */
export async function listRecommendationPanel(userId: string) {
  const [pending, recent] = await Promise.all([
    db.aiRecommendation.findMany({ where: { userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.aiRecommendation.findMany({
      where: { userId, status: { in: [...APPLIED, "IGNORED", "UNDONE"] }, decidedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { decidedAt: "desc" },
      take: 8,
    }),
  ]);
  return { pending: pending.map(toCardView), recent: recent.map(toCardView) };
}

// ─────────────────────────────────────────────────────────── proposals ──

export interface RoutineProposalInput {
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  add: { days: number[]; startMinute: number; endMinute: number; category: RoutineCategory; label: string | null; isFixed: boolean }[];
  removeBlockIds: string[];
}

/**
 * Validates a routine change set against the current routine and stores it as
 * a pending proposal. Throws DomainError with an actionable message otherwise.
 */
export async function createRoutineProposal(userId: string, input: RoutineProposalInput, source: RecommendationSource) {
  if (input.add.length === 0 && input.removeBlockIds.length === 0) throw new DomainError("A proposta não tem alterações.");
  const routine = await db.routine.findFirst({
    where: { userId, isActive: true },
    include: { blocks: { select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true, category: true, label: true } } },
  });
  const blocks = routine?.blocks ?? [];

  const removeIds = [...new Set(input.removeBlockIds)];
  const unknown = removeIds.filter((id) => !blocks.some((b) => b.id === id));
  if (unknown.length) throw new DomainError(`Blocos inexistentes na rotina atual: ${unknown.join(", ")}. Consulte a rotina e use os ids retornados.`);

  const remaining = blocks.filter((b) => !removeIds.includes(b.id));
  const occupied: (typeof remaining)[number][] = [...remaining];
  const problems: string[] = [];
  for (const a of input.add) {
    if (a.startMinute === a.endMinute) problems.push(`${blockName(a.category, a.label)}: início e fim iguais.`);
    for (const seg of blockSegments(a.days, a.startMinute, a.endMinute)) {
      const clash = findClash(occupied, seg);
      if (clash) {
        const id = "id" in clash && clash.id ? ` [id do bloco existente: ${clash.id}]` : " [conflito com outro bloco desta proposta]";
        problems.push(`${blockName(a.category, a.label)}: ${clashMessage(clash)}${id}`);
      } else occupied.push({ id: "", ...seg, category: a.category, label: a.label });
    }
  }
  if (problems.length) {
    throw new DomainError(`A proposta conflita com a rotina. Remova os blocos conflitantes (remover_blocos) ou ajuste os horários.\n${[...new Set(problems)].join("\n")}`);
  }

  const changes: RoutineChange[] = [
    ...removeIds.map((id, i): RoutineRemoveChange => {
      const b = blocks.find((x) => x.id === id)!;
      return { key: `r${i + 1}`, op: "remove", blockId: b.id, dayOfWeek: b.dayOfWeek, startMinute: b.startMinute, endMinute: b.endMinute, category: b.category, label: b.label };
    }),
    ...input.add.map((a, i): RoutineAddChange => ({ key: `a${i + 1}`, op: "add", ...a, days: [...new Set(a.days)].sort((x, y) => x - y) })),
  ];

  return db.aiRecommendation.create({
    data: {
      userId,
      kind: "ROUTINE_ADJUSTMENT",
      source,
      title: input.title,
      body: `${plural(changes.length, "alteração proposta", "alterações propostas")} na rotina.`,
      reason: input.reason,
      evidence: input.evidence as Prisma.InputJsonValue,
      proposedChanges: { changes } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export async function createGoalProposal(
  userId: string,
  input: { title: string; reason: string; evidence: Record<string, unknown>; values: Partial<Record<GoalField, number>> },
  source: RecommendationSource,
) {
  const profile = await db.profile.findUnique({ where: { userId }, select: { weeklyHoursTarget: true, dailyStudyLimitMin: true, maxSessionMin: true } });
  if (!profile) throw new DomainError("Perfil não encontrado.");
  const changes: GoalChange[] = [];
  for (const [field, value] of Object.entries(input.values) as [GoalField, number | undefined][]) {
    if (value === undefined) continue;
    const spec = GOAL_FIELDS[field];
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) throw new DomainError(`${spec.label} deve ficar entre ${spec.min} e ${spec.max}.`);
    const to = field === "weeklyHoursTarget" ? Math.round(value * 2) / 2 : Math.round(value);
    if (profile[field] === to) continue;
    changes.push({ key: field, op: "set", field, from: profile[field], to });
  }
  if (changes.length === 0) throw new DomainError("Os valores propostos já são os atuais.");
  const daily = changes.find((c) => c.field === "dailyStudyLimitMin")?.to ?? profile.dailyStudyLimitMin;
  const session = changes.find((c) => c.field === "maxSessionMin")?.to ?? profile.maxSessionMin;
  if (session > daily) throw new DomainError("A duração máxima da sessão não pode passar do limite diário.");

  return db.aiRecommendation.create({
    data: {
      userId,
      kind: "GOAL_ADJUSTMENT",
      source,
      title: input.title,
      body: `${plural(changes.length, "ajuste proposto", "ajustes propostos")} nas metas de estudo.`,
      reason: input.reason,
      evidence: input.evidence as Prisma.InputJsonValue,
      proposedChanges: { changes } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

// ──────────────────────────────────────────────────────── decisions ──

type Pending = AiRecommendation;

async function applyRoutine(userId: string, rec: Pending, selected: string[] | null) {
  const all = ((rec.proposedChanges ?? {}) as { changes?: RoutineChange[] }).changes ?? [];
  const chosen = all.filter((c) => !selected || selected.includes(c.key));
  if (chosen.length === 0) throw new DomainError("Selecione pelo menos uma alteração.");
  const status = chosen.length < all.length ? "EDITED" : "ACCEPTED";

  await db.$transaction(async (tx) => {
    const routine =
      (await tx.routine.findFirst({ where: { userId, isActive: true }, select: { id: true } })) ??
      (await tx.routine.create({ data: { userId, name: "Rotina principal", isActive: true }, select: { id: true } }));

    const removeIds = chosen.filter((c): c is RoutineRemoveChange => c.op === "remove").map((c) => c.blockId);
    const removed = removeIds.length ? await tx.routineBlock.findMany({ where: { id: { in: removeIds }, routineId: routine.id } }) : [];
    if (removed.length !== removeIds.length) throw new DomainError("A rotina mudou desde a sugestão: um bloco a remover não existe mais.");

    const remaining = await tx.routineBlock.findMany({
      where: { routineId: routine.id, id: { notIn: removeIds } },
      select: { dayOfWeek: true, startMinute: true, endMinute: true, category: true, label: true },
    });
    const parts = chosen
      .filter((c): c is RoutineAddChange => c.op === "add")
      .flatMap((c) => blockSegments(c.days, c.startMinute, c.endMinute).map((s) => ({ ...s, category: c.category, label: c.label, isFixed: c.isFixed })));
    const occupied = [...remaining];
    for (const p of parts) {
      const clash = findClash(occupied, p);
      if (clash) throw new DomainError(`${clashMessage(clash)} Ajuste a rotina ou selecione outras alterações.`);
      occupied.push(p);
    }

    await tx.routineBlock.deleteMany({ where: { id: { in: removeIds }, routineId: routine.id } });
    const createdIds: string[] = [];
    for (const p of parts) {
      const b = await tx.routineBlock.create({ data: { routineId: routine.id, ...p, energy: null }, select: { id: true } });
      createdIds.push(b.id);
    }
    await tx.aiRecommendation.update({
      where: { id: rec.id },
      data: {
        status,
        decidedAt: new Date(),
        previousState: {
          routineId: routine.id,
          createdBlockIds: createdIds,
          removedBlocks: removed.map((b) => ({ dayOfWeek: b.dayOfWeek, startMinute: b.startMinute, endMinute: b.endMinute, category: b.category, label: b.label, isFixed: b.isFixed, energy: b.energy, notes: b.notes })),
        } as Prisma.InputJsonValue,
      },
    });
  });
  return status === "EDITED" ? "Alterações selecionadas aplicadas à rotina." : "Rotina atualizada.";
}

async function undoRoutine(userId: string, rec: AiRecommendation) {
  const prev = (rec.previousState ?? {}) as {
    routineId?: string;
    createdBlockIds?: string[];
    removedBlocks?: { dayOfWeek: number; startMinute: number; endMinute: number; category: RoutineCategory; label: string | null; isFixed: boolean; energy: Prisma.RoutineBlockCreateManyInput["energy"]; notes: string | null }[];
  };
  const routine = prev.routineId ? await db.routine.findFirst({ where: { id: prev.routineId, userId }, select: { id: true } }) : null;
  if (!routine) throw new DomainError("A rotina desta sugestão não existe mais.");

  let skipped = 0;
  await db.$transaction(async (tx) => {
    await tx.routineBlock.deleteMany({ where: { id: { in: prev.createdBlockIds ?? [] }, routineId: routine.id } });
    const current = await tx.routineBlock.findMany({ where: { routineId: routine.id }, select: { dayOfWeek: true, startMinute: true, endMinute: true } });
    for (const b of prev.removedBlocks ?? []) {
      if (findClash(current, b)) {
        skipped++;
        continue;
      }
      await tx.routineBlock.create({ data: { routineId: routine.id, ...b } });
      current.push(b);
    }
    await tx.aiRecommendation.update({ where: { id: rec.id }, data: { status: "UNDONE", undoneAt: new Date() } });
  });
  return skipped
    ? `Alteração desfeita. ${plural(skipped, "bloco removido não voltou", "blocos removidos não voltaram")} porque o horário já foi ocupado.`
    : "Alteração da rotina desfeita.";
}

async function applyGoals(userId: string, rec: Pending, selected: string[] | null) {
  const all = ((rec.proposedChanges ?? {}) as { changes?: GoalChange[] }).changes ?? [];
  const chosen = all.filter((c) => !selected || selected.includes(c.key));
  if (chosen.length === 0) throw new DomainError("Selecione pelo menos um ajuste.");
  const profile = await db.profile.findUnique({ where: { userId }, select: { weeklyHoursTarget: true, dailyStudyLimitMin: true, maxSessionMin: true } });
  if (!profile) throw new DomainError("Perfil não encontrado.");
  const data = Object.fromEntries(chosen.map((c) => [c.field, c.to])) as Partial<Record<GoalField, number>>;
  if ((data.maxSessionMin ?? profile.maxSessionMin) > (data.dailyStudyLimitMin ?? profile.dailyStudyLimitMin)) {
    throw new DomainError("A duração máxima da sessão não pode passar do limite diário.");
  }
  const previous = Object.fromEntries(chosen.map((c) => [c.field, profile[c.field]]));
  await db.$transaction([
    db.profile.update({ where: { userId }, data }),
    db.aiRecommendation.update({
      where: { id: rec.id },
      data: { status: chosen.length < all.length ? "EDITED" : "ACCEPTED", decidedAt: new Date(), previousState: { fields: previous } as Prisma.InputJsonValue },
    }),
  ]);
  return "Metas de estudo atualizadas.";
}

async function undoGoals(userId: string, rec: AiRecommendation) {
  const prev = ((rec.previousState ?? {}) as { fields?: Partial<Record<GoalField, number | null>> }).fields ?? {};
  const data: Prisma.ProfileUpdateInput = {};
  if (prev.weeklyHoursTarget !== undefined) data.weeklyHoursTarget = prev.weeklyHoursTarget;
  if (typeof prev.dailyStudyLimitMin === "number") data.dailyStudyLimitMin = prev.dailyStudyLimitMin;
  if (typeof prev.maxSessionMin === "number") data.maxSessionMin = prev.maxSessionMin;
  await db.$transaction([
    db.profile.update({ where: { userId }, data }),
    db.aiRecommendation.update({ where: { id: rec.id }, data: { status: "UNDONE", undoneAt: new Date() } }),
  ]);
  return "Metas restauradas.";
}

export async function acceptRecommendation(userId: string, id: string, selected: string[] | null) {
  const rec = await db.aiRecommendation.findFirst({ where: { id, userId, status: "PENDING" } });
  if (!rec) throw new DomainError("Recomendação não encontrada ou já decidida.");
  switch (rec.kind) {
    case "REPLAN": {
      const total = ((rec.proposedChanges as { moves?: unknown[] } | null)?.moves ?? []).length;
      const applied = await applyReplan(userId, id, selected, selected && selected.length < total ? "EDITED" : "ACCEPTED");
      return applied === 1 ? "1 sessão reagendada." : `${applied} sessões reagendadas.`;
    }
    case "ROUTINE_ADJUSTMENT":
      return applyRoutine(userId, rec, selected);
    case "GOAL_ADJUSTMENT":
      return applyGoals(userId, rec, selected);
    default:
      throw new DomainError("Este tipo de recomendação não pode ser aplicado automaticamente.");
  }
}

export async function ignoreRecommendation(userId: string, id: string) {
  const { count } = await db.aiRecommendation.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "IGNORED", decidedAt: new Date() } });
  if (count === 0) throw new DomainError("Recomendação não encontrada ou já decidida.");
  return "Recomendação ignorada.";
}

export async function undoAnyRecommendation(userId: string, id: string) {
  const rec = await db.aiRecommendation.findFirst({ where: { id, userId, status: { in: [...APPLIED] } } });
  if (!rec) throw new DomainError("Nada para desfazer.");
  switch (rec.kind) {
    case "REPLAN":
      await undoReplan(userId, id);
      return "Reagendamento desfeito.";
    case "ROUTINE_ADJUSTMENT":
      return undoRoutine(userId, rec);
    case "GOAL_ADJUSTMENT":
      return undoGoals(userId, rec);
    default:
      throw new DomainError("Esta recomendação não pode ser desfeita.");
  }
}
