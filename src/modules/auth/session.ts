import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SecurityEventType } from "@prisma/client";
import { db } from "@/lib/db";
import { isProduction } from "@/lib/env";
import { generateToken, hashToken } from "./crypto";
import { SESSION_COOKIE, SESSION_REFRESH_AFTER_MS, SESSION_TTL_MS } from "./constants";

export async function createSession(userId: string) {
  const token = generateToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Resolves the signed-in user for this request (memoized per render).
 * Slides the server-side expiry at most once per hour.
 */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true } } },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now - session.lastSeenAt.getTime() > SESSION_REFRESH_AFTER_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
      })
      .catch(() => undefined);
  }

  const { passwordHash: _omit, ...user } = session.user;
  return { ...user, sessionId: session.id };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?sessao=expirada");
  return user;
}

/** For all app routes: signed in *and* onboarding finished. */
export async function requireOnboardedUser(): Promise<CurrentUser & { profile: NonNullable<CurrentUser["profile"]> }> {
  const user = await requireUser();
  if (!user.onboardedAt || !user.profile) redirect("/primeiros-passos");
  return user as CurrentUser & { profile: NonNullable<CurrentUser["profile"]> };
}

export async function logSecurityEvent(type: SecurityEventType, userId: string | null, detail?: string) {
  await db.securityEvent
    .create({ data: { type, userId, detail: detail?.slice(0, 200) } })
    .catch((err) => console.error("[security] failed to log event", type, err));
}
