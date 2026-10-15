import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { OfflineReview } from "@/components/flashcards/offline-review";

export const metadata: Metadata = { title: "Revisão offline" };
// A static shell with no personal data: the service worker can keep it for offline use.
export const dynamic = "force-static";

export default function OfflineReviewPage() {
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-10">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <Link href="/flashcards" className="text-sm text-fg-subtle hover:text-fg">
          Voltar aos flashcards
        </Link>
      </div>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 pt-10 pb-20">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Revisão offline</h1>
          <p className="text-base text-fg-muted">
            Revise os flashcards vencidos sem internet. As revisões ficam no aparelho e são enviadas quando a conexão voltar, sem duplicar. Ao sair da conta, tudo que foi guardado no
            aparelho é apagado.
          </p>
        </div>
        <OfflineReview />
      </main>
    </div>
  );
}
