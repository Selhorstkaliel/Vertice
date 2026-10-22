import "server-only";
import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { env } from "@/lib/env";
import type { beginChatGptSignIn } from "./chatgpt-auth";

export { CALLBACK_RESULT, CONNECT_CHANNEL, type CallbackResult } from "./chatgpt-results";

/*
 * Browser flow for the same local sign-in as `npm run chatgpt -- conectar`.
 * The Next server itself receives the callback, so the redirect URI is
 * http://127.0.0.1:<port>/auth/callback. The PKCE verifier, nonce and state
 * travel in an encrypted, httpOnly cookie scoped to /auth, bound to the user
 * who started the attempt. Tokens still go only to `.chatgpt/`. Each student
 * runs their own installation, so whoever signs in here owns the connection.
 */

export type ChatGptAttempt = Awaited<ReturnType<typeof beginChatGptSignIn>>;

export const ATTEMPT_COOKIE = "vertice_chatgpt_attempt";
export const ATTEMPT_TTL_S = 10 * 60;
export const CALLBACK_PATH = "/auth/callback";

const key = new Uint8Array(hkdfSync("sha256", Buffer.from(env.SESSION_SECRET), Buffer.from("vertice-chatgpt-v1"), Buffer.from("browser-attempt"), 32));

/** The OAuth client only accepts IPv4 loopback callbacks: `localhost` would not receive the cookie. */
export function loopbackRedirectUri(host: string | null) {
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(host ?? "");
  return match ? `http://127.0.0.1:${match[1]}${CALLBACK_PATH}` : null;
}

export async function sealAttempt(attempt: ChatGptAttempt, userId: string, popup: boolean, returnTo: string) {
  return new EncryptJWT({ attempt, userId, popup, returnTo })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${ATTEMPT_TTL_S}s`)
    .encrypt(key);
}

export async function openAttempt(token: string | undefined, userId: string): Promise<{ attempt: ChatGptAttempt; popup: boolean; returnTo: unknown } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key);
    return payload.userId === userId ? { attempt: payload.attempt as ChatGptAttempt, popup: payload.popup === true, returnTo: payload.returnTo } : null;
  } catch {
    return null;
  }
}
