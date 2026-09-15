"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, fromZodError, ok, runAction, type ActionResult } from "@/lib/action";
import { hashPassword, verifyPassword } from "@/modules/auth/crypto";
import { changePasswordSchema } from "@/modules/auth/schemas";
import { rateLimit, retryMessage } from "@/modules/auth/rate-limit";
import { destroyCurrentSession, logSecurityEvent, requireOnboardedUser } from "@/modules/auth/session";
import { detectImageType, MAX_AVATAR_BYTES } from "./avatar";

const DEMO_BLOCKED = "A conta de demonstração é compartilhada e não permite alterar dados de acesso.";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function updateNameAction(name: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (user.isDemo) return fail(DEMO_BLOCKED);
    const parsed = z.string().trim().min(2, "Informe seu nome.").max(80, "Nome longo demais.").safeParse(name);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, { name: [parsed.error.issues[0]!.message] });
    await db.user.update({ where: { id: user.id }, data: { name: parsed.data } });
    revalidateAll();
    return ok(null, "Nome atualizado.");
  });
}

export async function uploadAvatarAction(formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (user.isDemo) return fail(DEMO_BLOCKED);
    const limit = await rateLimit(`avatar:${user.id}`, 10, 60 * 60_000);
    if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) return fail("Escolha uma imagem.");
    if (file.size > MAX_AVATAR_BYTES) return fail("Imagem grande demais depois do ajuste. Tente outra foto.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The declared type is not trusted: the signature bytes decide.
    const type = detectImageType(bytes);
    if (!type) return fail("Use uma imagem PNG, JPEG ou WebP.");
    const dataUrl = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    await db.user.update({ where: { id: user.id }, data: { avatarUrl: dataUrl } });
    revalidateAll();
    return ok(null, "Foto atualizada.");
  });
}

export async function removeAvatarAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (user.isDemo) return fail(DEMO_BLOCKED);
    await db.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    revalidateAll();
    return ok(null, "Foto removida.");
  });
}

const TRACKS = ["PUBLIC", "MILITARY", "BOTH"] as const;

const preferencesSchema = z
  .object({
    goal: z.string().trim().max(200, "Objetivo longo demais."),
    track: z.enum(TRACKS),
    weeklyHoursTarget: z.number().min(1, "Mínimo de 1 hora.").max(80, "Máximo de 80 horas.").nullable(),
    dailyStudyLimitMin: z.number().int().min(30, "Mínimo de 30 minutos.").max(720, "Máximo de 12 horas."),
    maxSessionMin: z.number().int().min(20, "Mínimo de 20 minutos.").max(240, "Máximo de 4 horas."),
    minBreakMin: z.number().int().min(0, "Valor inválido.").max(60, "Máximo de 60 minutos."),
    timezone: z.string().max(60).refine((tz) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Fuso horário inválido."),
    autoApplyMinorChanges: z.boolean(),
    works: z.boolean(),
    studiesCollege: z.boolean(),
    physicalPrep: z.boolean(),
  })
  .refine((v) => v.maxSessionMin <= v.dailyStudyLimitMin, { path: ["maxSessionMin"], message: "A sessão não pode ser maior que o limite diário." });

export type PreferencesInput = z.input<typeof preferencesSchema>;

export async function updatePreferencesAction(input: PreferencesInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const d = parsed.data;
    await db.profile.update({
      where: { userId: user.id },
      data: { ...d, goal: d.goal || null, weeklyHoursTarget: d.weeklyHoursTarget === null ? null : Math.round(d.weeklyHoursTarget * 2) / 2 },
    });
    revalidateAll();
    return ok(null, "Preferências salvas. O próximo plano gerado já usa os novos valores.");
  });
}

export async function changePasswordAction(input: { current: string; password: string; confirm: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    if (user.isDemo) return fail(DEMO_BLOCKED);
    const limit = await rateLimit(`change-password:${user.id}`, 5, 15 * 60_000);
    if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(parsed.data.current, row.passwordHash))) return fail("Senha atual incorreta.", { current: ["Senha atual incorreta."] });
    if (await verifyPassword(parsed.data.password, row.passwordHash)) return fail("A nova senha precisa ser diferente da atual.", { password: ["Use uma senha diferente."] });

    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
      // Other devices must sign in again with the new password.
      db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } }),
      db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    ]);
    await logSecurityEvent("PASSWORD_CHANGED", user.id);
    revalidatePath("/configuracoes");
    return ok(null, "Senha alterada. As outras sessões foram encerradas.");
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    revalidatePath("/configuracoes");
    return ok(null, count ? `${count === 1 ? "1 sessão encerrada" : `${count} sessões encerradas`}.` : "Não há outras sessões ativas.");
  });
}

export async function deleteMentorHistoryAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireOnboardedUser();
    const { count } = await db.mentorMessage.deleteMany({ where: { userId: user.id } });
    revalidatePath("/mentor");
    revalidatePath("/configuracoes");
    return ok(null, count ? "Conversas com o Mentor apagadas." : "Não havia conversas com o Mentor.");
  });
}

export async function deleteAccountAction(input: { password: string; confirmation: string }): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const user = await requireOnboardedUser();
    if (user.isDemo) return fail("A conta de demonstração não pode ser excluída.");
    const limit = await rateLimit(`delete-account:${user.id}`, 5, 15 * 60_000);
    if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));
    if (input.confirmation?.trim().toUpperCase() !== "EXCLUIR") return fail("Digite EXCLUIR para confirmar.", { confirmation: ["Digite EXCLUIR."] });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(input.password ?? "", row.passwordHash))) return fail("Senha incorreta.", { password: ["Senha incorreta."] });

    // Rows that restrict subject deletion go first; cascades then remove everything else the student owns.
    await db.$transaction([
      db.errorEntry.deleteMany({ where: { userId: user.id } }),
      db.question.deleteMany({ where: { ownerId: user.id } }),
      db.user.delete({ where: { id: user.id } }),
    ]);
    await destroyCurrentSession();
    return ok(null);
  });
  if (result.ok) redirect("/?conta=excluida");
  return result;
}
