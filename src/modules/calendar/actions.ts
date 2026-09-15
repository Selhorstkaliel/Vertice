"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { parseClock } from "@/lib/format";
import { isDateKey, zonedToUtc } from "@/lib/time";
import { requireOnboardedUser } from "@/modules/auth/session";

const EDITABLE_TYPES = ["CUSTOM", "EXAM", "REGISTRATION", "EDITAL", "SIMULATION", "TAF", "GOAL"] as const;

const eventSchema = z
  .object({
    type: z.enum(EDITABLE_TYPES),
    title: z.string().trim().min(2, "Informe um título.").max(100, "Título longo demais."),
    date: z.string().refine(isDateKey, "Data inválida."),
    allDay: z.boolean(),
    start: z.string().max(5).optional(),
    end: z.string().max(5).optional(),
    description: z.string().trim().max(500, "Descrição longa demais.").optional(),
    competitionId: z.string().max(40).nullable().transform((v) => v || null),
  })
  .transform((v, ctx) => {
    if (v.allDay) return { ...v, startMinute: null, endMinute: null };
    const startMinute = v.start ? parseClock(v.start) : null;
    const endMinute = v.end ? parseClock(v.end) : null;
    if (startMinute === null) {
      ctx.addIssue({ code: "custom", path: ["start"], message: "Informe o horário de início." });
      return z.NEVER;
    }
    if (v.end && endMinute === null) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "Horário inválido." });
      return z.NEVER;
    }
    if (endMinute !== null && endMinute <= startMinute) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "O fim precisa ser depois do início." });
      return z.NEVER;
    }
    return { ...v, startMinute, endMinute };
  });

export type CalendarEventInput = z.input<typeof eventSchema>;

export async function saveCalendarEventAction(id: string | null, input: CalendarEventInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = eventSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    const tz = user.profile.timezone;
    if (d.competitionId && !(await db.studentCompetition.findFirst({ where: { userId: user.id, competitionId: d.competitionId }, select: { id: true } }))) {
      return fail("Concurso não encontrado na sua lista.");
    }
    const data = {
      type: d.type,
      title: d.title,
      description: d.description || null,
      allDay: d.allDay,
      // All-day events are anchored at local midnight so range queries by local day stay exact.
      startsAt: zonedToUtc(d.date, d.startMinute ?? 0, tz),
      endsAt: d.endMinute !== null ? zonedToUtc(d.date, d.endMinute, tz) : null,
      competitionId: d.competitionId,
    };
    if (id) {
      const { count } = await db.calendarEvent.updateMany({ where: { id, userId: user.id }, data });
      if (count === 0) return fail("Evento não encontrado.");
    } else {
      if ((await db.calendarEvent.count({ where: { userId: user.id } })) >= 2000) return fail("Limite de eventos atingido. Exclua eventos antigos.");
      await db.calendarEvent.create({ data: { userId: user.id, ...data } });
    }
    revalidatePath("/calendario");
    return ok(null, id ? "Evento atualizado." : "Evento criado.");
  });
}

export async function deleteCalendarEventAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.calendarEvent.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return fail("Evento não encontrado.");
    revalidatePath("/calendario");
    return ok(null, "Evento excluído.");
  });
}
