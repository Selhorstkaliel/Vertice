import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "@/lib/env";

const BCRYPT_COST = 12;

// A real cost-12 hash of a random secret, compared against when the account
// does not exist so response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= bcrypt.hash(randomBytes(24).toString("hex"), BCRYPT_COST);
  return dummyHash;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(password, hash ?? (await getDummyHash()));
  return hash ? ok : false;
}

/** URL-safe random token with 256 bits of entropy. */
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored only as keyed hashes, so a database leak can't be replayed. */
export function hashToken(token: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Short keyed fingerprint for logs — never log raw emails of unknown accounts. */
export function fingerprint(value: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(`fp:${value}`).digest("hex").slice(0, 12);
}
