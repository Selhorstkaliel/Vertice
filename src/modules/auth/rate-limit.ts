import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { decide, windowStart } from "@/engines/security/sliding-window";

/**
 * Sliding-window rate limiter stored in PostgreSQL, so every app instance
 * shares the same counters. A per-key advisory lock serializes concurrent
 * requests (also across instances), and the database clock is the reference,
 * so servers with slightly different clocks still agree.
 */

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

let lastSweep = 0;
const SWEEP_EVERY_MS = 5 * 60_000;

function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((err) => console.error("[rate-limit] sweep failed", err));
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const keyHash = hashKey(key);
  sweepExpired();

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${keyHash}))`;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const nowMs = clock!.now.getTime();
    const current = windowStart(nowMs, windowMs);
    const previous = current - windowMs;

    const rows = await tx.rateLimitCounter.findMany({
      where: { keyHash, windowStart: { in: [new Date(current), new Date(previous)] } },
      select: { windowStart: true, count: true },
    });
    const counts = {
      current: rows.find((r) => r.windowStart.getTime() === current)?.count ?? 0,
      previous: rows.find((r) => r.windowStart.getTime() === previous)?.count ?? 0,
    };

    const decision = decide(nowMs, windowMs, limit, counts);
    // Blocked attempts are not counted, so an attacker cannot extend a lock indefinitely.
    if (decision.allowed) {
      await tx.rateLimitCounter.upsert({
        where: { keyHash_windowStart: { keyHash, windowStart: new Date(current) } },
        update: { count: { increment: 1 } },
        create: { keyHash, windowStart: new Date(current), count: 1, expiresAt: new Date(current + 2 * windowMs) },
      });
    }
    return { ok: decision.allowed, retryAfterSec: decision.retryAfterSec };
  });
}

export async function resetRateLimit(key: string) {
  await db.rateLimitCounter.deleteMany({ where: { keyHash: hashKey(key) } });
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

export function retryMessage(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}
