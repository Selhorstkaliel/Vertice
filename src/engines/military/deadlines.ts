import { diffDays, type DateKey } from "@/lib/time";

/**
 * Stage deadlines (documents, health exams, registration and appeal windows):
 * which reminder each pending item is due today. Pure.
 *
 * One reminder per threshold (7, 3 and 1 day before). A student who comes back
 * with 2 days left gets the 3-day reminder only — never a burst of late ones.
 * The due date is part of the key, so moving the date arms the reminders again.
 */

export const REMINDER_OFFSETS = [7, 3, 1] as const;

export interface DeadlineItem {
  id: string;
  title: string;
  dueKey: DateKey | null;
  done: boolean;
}

export interface DueReminder {
  itemId: string;
  title: string;
  dueKey: DateKey;
  daysLeft: number;
  offset: (typeof REMINDER_OFFSETS)[number];
  dedupeKey: string;
}

export function dueReminders(items: DeadlineItem[], today: DateKey): DueReminder[] {
  const out: DueReminder[] = [];
  for (const item of items) {
    if (item.done || !item.dueKey) continue;
    const daysLeft = diffDays(today, item.dueKey);
    if (daysLeft < 1) continue;
    const offset = [...REMINDER_OFFSETS].sort((a, b) => a - b).find((o) => daysLeft <= o);
    if (offset === undefined) continue;
    out.push({ itemId: item.id, title: item.title, dueKey: item.dueKey, daysLeft, offset, dedupeKey: `stage-item:${item.id}:${item.dueKey}:${offset}` });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function reminderTitle(r: Pick<DueReminder, "title" | "daysLeft">) {
  return r.daysLeft === 1 ? `Amanhã: ${r.title}` : `Faltam ${r.daysLeft} dias: ${r.title}`;
}
