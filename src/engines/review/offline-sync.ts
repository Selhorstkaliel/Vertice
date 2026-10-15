/**
 * Offline flashcard sync decisions (pure). Each review made on the device
 * carries a client-generated id; the server stores a given id once.
 *
 * - duplicate: the id was already stored (a retried or repeated sync);
 * - rejected: unknown card, or a timestamp in the future or too old to trust;
 * - apply: the review is newer than the card's last review: it moves the schedule;
 * - record: an older review (the card was reviewed online meanwhile, or it was
 *   suspended): kept in the history, the schedule is not moved back.
 */

export const MAX_FUTURE_SKEW_MS = 5 * 60_000;
export const MAX_REVIEW_AGE_MS = 30 * 86_400_000;

export type SyncDecision = "duplicate" | "rejected" | "apply" | "record";

export function decideOfflineReview(
  review: { clientId: string; reviewedAt: Date },
  card: { lastReviewedAt: Date | null; suspended: boolean } | null,
  storedClientIds: Set<string>,
  now: Date,
): SyncDecision {
  if (storedClientIds.has(review.clientId)) return "duplicate";
  const t = review.reviewedAt.getTime();
  if (Number.isNaN(t) || t > now.getTime() + MAX_FUTURE_SKEW_MS || now.getTime() - t > MAX_REVIEW_AGE_MS) return "rejected";
  if (!card) return "rejected";
  if (card.suspended) return "record";
  return !card.lastReviewedAt || t >= card.lastReviewedAt.getTime() ? "apply" : "record";
}

/** Device queue after a sync: what the server acknowledged leaves; the rest is retried later. */
export function remainingQueue<T extends { clientId: string }>(queue: T[], results: { clientId: string; status: string }[]) {
  const done = new Set(results.filter((r) => r.status !== "error").map((r) => r.clientId));
  return queue.filter((q) => !done.has(q.clientId));
}
