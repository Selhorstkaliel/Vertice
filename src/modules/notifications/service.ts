import "server-only";
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Same key → emitted at most once per student. */
  dedupeKey: string;
}

/** Stores notices the student has not muted. Returns how many were new. */
export async function notify(userId: string, notices: NewNotification[]) {
  if (notices.length === 0) return 0;
  const muted = await db.notificationPreference.findMany({ where: { userId, enabled: false }, select: { type: true } });
  const blocked = new Set(muted.map((m) => m.type));
  const allowed = notices.filter((n) => !blocked.has(n.type));
  if (allowed.length === 0) return 0;
  const { count } = await db.notification.createMany({
    data: allowed.map((n) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, href: n.href ?? null, dedupeKey: n.dedupeKey })),
    skipDuplicates: true,
  });
  return count;
}

export async function listNotifications(userId: string, limit = 100) {
  const [items, preferences] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    db.notificationPreference.findMany({ where: { userId }, select: { type: true, enabled: true } }),
  ]);
  return { items, muted: new Set(preferences.filter((p) => !p.enabled).map((p) => p.type)) };
}
