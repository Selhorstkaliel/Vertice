import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, localNow, zonedToUtc } from "@/lib/time";
import { reviewCard } from "@/engines/review/spaced-repetition";
import { decideOfflineReview } from "@/engines/review/offline-sync";
import { NEW_CARDS_PER_DAY, toSchedule } from "./service";

/** Upper bound of cards kept on the device. */
const MAX_OFFLINE_CARDS = 300;

/**
 * Cards due today and tomorrow, with only what review needs: no figures,
 * notes, tags or links to questions. Personal data stays on the server.
 */
export async function getOfflinePack(userId: string, tz: string) {
  const end = zonedToUtc(addDays(localNow(tz).key, 2), 0, tz);
  const select = { id: true, front: true, back: true, type: true, state: true, intervalDays: true, ease: true, reps: true, lapses: true, learningStep: true, dueAt: true, lastReviewedAt: true } satisfies Prisma.FlashcardSelect;
  const [due, fresh] = await Promise.all([
    db.flashcard.findMany({ where: { userId, suspended: false, state: { not: "NEW" }, dueAt: { lt: end } }, select, orderBy: { dueAt: "asc" }, take: MAX_OFFLINE_CARDS }),
    db.flashcard.findMany({ where: { userId, suspended: false, state: "NEW" }, select, orderBy: { createdAt: "asc" }, take: NEW_CARDS_PER_DAY * 2 }),
  ]);
  return {
    userId,
    downloadedAt: new Date().toISOString(),
    cards: [...due, ...fresh].slice(0, MAX_OFFLINE_CARDS).map((c) => ({ ...c, dueAt: c.dueAt.toISOString(), lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null })),
  };
}

export const offlineReviewSchema = z.object({
  clientId: z.string().uuid(),
  flashcardId: z.string().min(1).max(40),
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  reviewedAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(30 * 60_000).nullable(),
});
export type OfflineReview = z.infer<typeof offlineReviewSchema>;

export type SyncStatus = "applied" | "duplicate" | "recorded" | "rejected";

/**
 * Applies offline reviews in the order they happened. Idempotent: a review
 * already stored (same clientId) is reported as duplicate and never stored
 * twice. A review older than the card's last review (the card was reviewed
 * online meanwhile) is kept in the history without moving the schedule back.
 */
export async function applyOfflineReviews(userId: string, reviews: OfflineReview[], now = new Date()) {
  const results: { clientId: string; status: SyncStatus }[] = [];
  const sorted = [...reviews].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const known = new Set(
    (await db.flashcardReview.findMany({ where: { clientId: { in: sorted.map((r) => r.clientId) } }, select: { clientId: true } })).flatMap((r) => (r.clientId ? [r.clientId] : [])),
  );

  for (const r of sorted) {
    const at = new Date(r.reviewedAt);
    try {
      const status = await db.$transaction(async (tx) => {
        const card = await tx.flashcard.findFirst({ where: { id: r.flashcardId, userId } });
        const decision = decideOfflineReview({ clientId: r.clientId, reviewedAt: at }, card, known, now);
        if (decision === "duplicate" || decision === "rejected" || !card) return decision === "duplicate" ? ("duplicate" as const) : ("rejected" as const);
        if (decision === "apply") {
          const { next } = reviewCard(toSchedule(card), r.rating, at);
          await tx.flashcard.update({
            where: { id: card.id },
            data: { state: next.state, intervalDays: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses, learningStep: next.learningStep, dueAt: next.dueAt, lastReviewedAt: at },
          });
          await tx.flashcardReview.create({
            data: { flashcardId: card.id, userId, rating: r.rating, stateBefore: card.state, intervalBefore: card.intervalDays, intervalAfter: next.intervalDays, easeBefore: card.ease, easeAfter: next.ease, durationMs: r.durationMs, reviewedAt: at, clientId: r.clientId },
          });
          return "applied" as const;
        }
        await tx.flashcardReview.create({
          data: { flashcardId: card.id, userId, rating: r.rating, stateBefore: card.state, intervalBefore: card.intervalDays, intervalAfter: card.intervalDays, easeBefore: card.ease, easeAfter: card.ease, durationMs: r.durationMs, reviewedAt: at, clientId: r.clientId },
        });
        return "recorded" as const;
      });
      known.add(r.clientId);
      results.push({ clientId: r.clientId, status });
    } catch (err) {
      // Two syncs racing on the same review: the unique clientId keeps one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") results.push({ clientId: r.clientId, status: "duplicate" });
      else throw err;
    }
  }
  return results;
}
