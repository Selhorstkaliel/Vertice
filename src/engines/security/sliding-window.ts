/**
 * Sliding-window rate limit, counter variant: two fixed windows (previous and
 * current) where the previous one is weighted by how much of it still overlaps
 * the sliding window. Constant storage per key, close to an exact sliding log.
 */

export interface WindowCounts {
  /** Hits counted in the current fixed window. */
  current: number;
  /** Hits counted in the previous fixed window. */
  previous: number;
}

export interface SlidingDecision {
  allowed: boolean;
  /** Estimated hits in the sliding window before this request. */
  estimated: number;
  retryAfterSec: number;
}

export function windowStart(nowMs: number, windowMs: number) {
  return Math.floor(nowMs / windowMs) * windowMs;
}

export function decide(nowMs: number, windowMs: number, limit: number, counts: WindowCounts): SlidingDecision {
  const start = windowStart(nowMs, windowMs);
  const elapsed = nowMs - start;
  const previousWeight = (windowMs - elapsed) / windowMs;
  const estimated = counts.current + counts.previous * previousWeight;
  if (estimated < limit) return { allowed: true, estimated, retryAfterSec: 0 };

  let waitMs: number;
  if (counts.current >= limit) {
    // Blocked until this window ends and the previous-window share has decayed enough.
    const nextPrevious = counts.current;
    waitMs = windowMs - elapsed + (nextPrevious >= limit ? windowMs * (1 - (limit - 0.5) / nextPrevious) : 0);
  } else {
    // Wait until previous * weight + current drops below the limit.
    const neededWeight = (limit - counts.current - 0.5) / counts.previous;
    waitMs = Math.max(0, windowMs * (1 - neededWeight) - elapsed);
  }
  return { allowed: false, estimated, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
}
