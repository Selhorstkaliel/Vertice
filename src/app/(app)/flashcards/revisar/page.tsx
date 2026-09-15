import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReviewSession } from "@/components/flashcards/review-session";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getReviewQueue, type ReviewQueueFilters } from "@/modules/flashcards/service";

export const metadata: Metadata = { title: "Revisar flashcards" };

// The queue must reflect the latest review state on every visit.
export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<ReviewQueueFilters> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const cards = await getReviewQueue(user.id, user.profile.timezone, { materia: params.materia, banca: params.banca });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/flashcards" className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg">
        <ChevronLeft className="size-4" />
        Flashcards
      </Link>
      <h1 className="sr-only">Revisão de flashcards</h1>
      <ReviewSession cards={cards} />
    </div>
  );
}
