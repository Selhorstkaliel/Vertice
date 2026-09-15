"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fail, fromZodError, type ActionResult } from "@/lib/action";
import { fingerprint, generateToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import { RESET_TOKEN_TTL_MS, safeRedirectPath } from "./constants";
import { clientIp, rateLimit, resetRateLimit, retryMessage } from "./rate-limit";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "./schemas";
import {
  createSession,
  destroyCurrentSession,
  getCurrentUser,
  logSecurityEvent,
  revokeAllSessions,
} from "./session";
import { sendMail } from "./mailer";

export type FormState = ActionResult<{ sent?: boolean }> | null;

const WINDOW_15M = 15 * 60_000;
const WINDOW_1H = 60 * 60_000;

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const ip = await clientIp();
  const limit = await rateLimit(`register:${ip}`, 5, WINDOW_1H);
  if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));

  const { name, email, password } = parsed.data;
  const duplicate = () =>
    fail("Já existe uma conta com este e-mail. Entre ou recupere sua senha.", { email: ["E-mail já cadastrado."] });
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return duplicate();

  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        profile: { create: {} },
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (err) {
    // Concurrent sign-up with the same e-mail.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return duplicate();
    throw err;
  }

  await logSecurityEvent("REGISTER", userId);
  await createSession(userId);
  redirect("/primeiros-passos");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const { email, password, next } = parsed.data;
  const ip = await clientIp();
  const perAccount = await rateLimit(`login:${ip}:${email}`, 5, WINDOW_15M);
  const perIp = await rateLimit(`login-ip:${ip}`, 30, WINDOW_15M);
  // The IP comes from proxy headers a client can forge; this cap holds even if every attempt claims a new IP.
  const perEmail = await rateLimit(`login-account:${email}`, 20, WINDOW_15M);
  if (!perAccount.ok || !perIp.ok || !perEmail.ok) {
    return fail(retryMessage(Math.max(perAccount.retryAfterSec, perIp.retryAfterSec, perEmail.retryAfterSec)));
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid) {
    await logSecurityEvent("LOGIN_FAILURE", user?.id ?? null, user ? undefined : `fp:${fingerprint(email)}`);
    return fail("E-mail ou senha incorretos.");
  }

  await resetRateLimit(`login:${ip}:${email}`);
  await logSecurityEvent("LOGIN_SUCCESS", user.id);
  await createSession(user.id);
  redirect(safeRedirectPath(next));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await logSecurityEvent("LOGOUT", user.id);
  redirect("/entrar");
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fromZodError(parsed.error);
  const { email } = parsed.data;

  const ip = await clientIp();
  const perIp = await rateLimit(`forgot-ip:${ip}`, 10, WINDOW_1H);
  const perEmail = await rateLimit(`forgot:${email}`, 3, WINDOW_1H);
  if (!perIp.ok) return fail(retryMessage(perIp.retryAfterSec));

  // Same response whether or not the account exists.
  const response: FormState = {
    ok: true,
    data: { sent: true },
    message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha.",
  };
  if (!perEmail.ok) return response;

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return response;

  const token = generateToken();
  await db.$transaction([
    // Only the newest link stays valid.
    db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = `${env.NEXT_PUBLIC_APP_URL}/redefinir-senha?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Redefinição de senha — Vértice",
    text: [
      `Olá, ${user.name.split(" ")[0]}.`,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta no Vértice.",
      `Use o link abaixo em até 60 minutos:`,
      link,
      "",
      "Se você não fez esse pedido, ignore esta mensagem. Sua senha atual continua válida.",
    ].join("\n"),
  });
  await logSecurityEvent("PASSWORD_RESET_REQUESTED", user.id);

  return response;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    if (flat.token) return fail("Link inválido ou expirado. Solicite um novo.");
    return fromZodError(parsed.error);
  }

  const ip = await clientIp();
  const limit = await rateLimit(`reset:${ip}`, 10, WINDOW_1H);
  if (!limit.ok) return fail(retryMessage(limit.retryAfterSec));

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return fail("Link inválido ou expirado. Solicite um novo.");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(record.userId);
  await logSecurityEvent("PASSWORD_RESET_COMPLETED", record.userId);
  await createSession(record.userId);
  redirect("/painel");
}
