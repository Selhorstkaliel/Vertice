import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { dbDateToKey, localNow } from "@/lib/time";
import { formatDayKey } from "@/lib/format";
import { dueReminders, reminderTitle } from "@/engines/military/deadlines";
import { mailerConfigured, sendMail } from "@/modules/auth/mailer";
import { notify } from "@/modules/notifications/service";

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Copies catalog checklist items into the student's stages, matching stages
 * by name (student stages were copied from the catalog by name). Idempotent:
 * an item already copied is never duplicated nor overwritten.
 */
export async function syncStageItems(userId: string) {
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      stages: { select: { id: true, name: true, items: { select: { catalogItemId: true } } } },
      competition: { select: { id: true, forkedFromId: true } },
    },
  });
  if (enrollments.length === 0) return 0;
  const catalogIds = [...new Set(enrollments.map((e) => e.competition.forkedFromId ?? e.competition.id))];
  const catalogStages = await db.competitionStage.findMany({
    where: { competitionId: { in: catalogIds }, items: { some: {} } },
    select: { competitionId: true, name: true, items: { orderBy: { order: "asc" } } },
  });
  if (catalogStages.length === 0) return 0;

  const data = [];
  for (const e of enrollments) {
    const catalogId = e.competition.forkedFromId ?? e.competition.id;
    for (const stage of e.stages) {
      const source = catalogStages.find((c) => c.competitionId === catalogId && normalize(c.name) === normalize(stage.name));
      if (!source) continue;
      const copied = new Set(stage.items.map((i) => i.catalogItemId));
      for (const item of source.items) {
        if (copied.has(item.id)) continue;
        data.push({
          studentStageId: stage.id,
          catalogItemId: item.id,
          kind: item.kind,
          title: item.title,
          notes: item.description,
          dueDate: item.dueDate,
          dateFromCatalog: !!item.dueDate,
          order: item.order,
          sourceUrl: item.sourceUrl,
          sourceYear: item.sourceYear,
          verification: item.verification,
        });
      }
    }
  }
  if (data.length === 0) return 0;
  const { count } = await db.studentStageItem.createMany({ data, skipDuplicates: true });
  return count;
}

/** Pending dated items of the student, for reminders and the calendar. */
export async function pendingDatedItems(userId: string) {
  return db.studentStageItem.findMany({
    where: { doneAt: null, dueDate: { not: null }, stage: { enrollment: { userId, status: { not: "ARCHIVED" } } } },
    select: {
      id: true,
      title: true,
      dueDate: true,
      kind: true,
      verification: true,
      dateFromCatalog: true,
      stage: { select: { name: true, enrollment: { select: { competitionId: true, competition: { select: { name: true, kind: true } } } } } },
    },
  });
}

/**
 * In-app reminders 7, 3 and 1 day before each deadline (deduplicated).
 * E-mail copies are ready but stay off until a provider exists and
 * STAGE_REMINDER_EMAILS is turned on.
 */
export async function generateStageReminders(userId: string, tz: string) {
  await syncStageItems(userId);
  const items = await pendingDatedItems(userId);
  const today = localNow(tz).key;
  const reminders = dueReminders(
    items.map((i) => ({ id: i.id, title: i.title, dueKey: dbDateToKey(i.dueDate!), done: false })),
    today,
  );
  if (reminders.length === 0) return 0;
  const byId = new Map(items.map((i) => [i.id, i]));
  const notices = reminders.map((r) => {
    const item = byId.get(r.itemId)!;
    const c = item.stage.enrollment.competition;
    const unverified = item.dateFromCatalog && item.verification !== "VERIFIED";
    return {
      type: "STAGE_DEADLINE" as const,
      title: reminderTitle(r),
      body: `${c.name}, ${item.stage.name}. Prazo: ${formatDayKey(r.dueKey)}.${unverified ? " Informação não verificada: confirme a data no edital." : ""}`,
      href: c.kind === "MILITARY" ? "/militar" : `/concursos/${item.stage.enrollment.competitionId}`,
      dedupeKey: r.dedupeKey,
    };
  });
  // Only reminders never sent before go out by e-mail too.
  const already = new Set(
    (await db.notification.findMany({ where: { userId, dedupeKey: { in: notices.map((n) => n.dedupeKey) } }, select: { dedupeKey: true } })).map((n) => n.dedupeKey),
  );
  const fresh = notices.filter((n) => !already.has(n.dedupeKey));
  const created = await notify(userId, fresh);
  if (created > 0 && env.STAGE_REMINDER_EMAILS === "on" && mailerConfigured) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      await sendMail({
        to: user.email,
        subject: fresh.length === 1 ? fresh[0]!.title : `${fresh.length} prazos do seu concurso se aproximam`,
        text: fresh.map((n) => `${n.title}\n${n.body}`).join("\n\n"),
      });
    }
  }
  return created;
}
