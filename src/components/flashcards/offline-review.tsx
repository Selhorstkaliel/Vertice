"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/display";
import { REVIEW_RATING_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { previewIntervals, reviewCard, type CardSchedule, type Rating } from "@/engines/review/spaced-repetition";
import { remainingQueue } from "@/engines/review/offline-sync";
import { clearOfflineData, getCards, getMeta, getQueue, recordReview, removeFromQueue, saveDownload, type OfflineCard, type QueuedReview } from "@/lib/offline-store";

const RATINGS: Rating[] = ["AGAIN", "HARD", "GOOD", "EASY"];

const toSchedule = (c: OfflineCard): CardSchedule => ({
  state: c.state,
  intervalDays: c.intervalDays,
  ease: c.ease,
  reps: c.reps,
  lapses: c.lapses,
  learningStep: c.learningStep,
  dueAt: new Date(c.dueAt),
  lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt) : null,
});

/** Due now (or new). Tomorrow's cards stay on the device for when they come due. */
const dueNow = (cards: OfflineCard[], now: number) =>
  cards.filter((c) => c.state === "NEW" || new Date(c.dueAt).getTime() <= now).sort((a, b) => (a.state === "NEW" ? 1 : 0) - (b.state === "NEW" ? 1 : 0) || a.dueAt.localeCompare(b.dueAt));

export function OfflineReview() {
  const [online, setOnline] = React.useState(true);
  const [cards, setCards] = React.useState<OfflineCard[]>([]);
  const [queue, setQueue] = React.useState<QueuedReview[]>([]);
  const [downloadedAt, setDownloadedAt] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const shownAt = React.useRef(Date.now());

  const reload = React.useCallback(async () => {
    const [c, q, m] = await Promise.all([getCards(), getQueue(), getMeta()]);
    setCards(c);
    setQueue(q);
    setDownloadedAt(m?.downloadedAt ?? null);
  }, []);

  /** Sends pending reviews, then downloads a fresh set. Never loses the queue on failure. */
  const syncAndDownload = React.useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    try {
      const pending = await getQueue();
      if (pending.length) {
        const res = await fetch("/api/flashcards/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviews: pending }) });
        if (res.status === 401) {
          setNeedsLogin(true);
          return;
        }
        if (!res.ok) throw new Error("sync");
        const { results } = (await res.json()) as { results: { clientId: string; status: string }[] };
        const left = remainingQueue(pending, results);
        await removeFromQueue(pending.filter((p) => !left.includes(p)).map((p) => p.clientId));
        setStatus(`${pending.length - left.length} ${pending.length - left.length === 1 ? "revisão sincronizada" : "revisões sincronizadas"}.`);
      }
      const res = await fetch("/api/flashcards/offline", { cache: "no-store" });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!res.ok) throw new Error("download");
      const pack = (await res.json()) as { userId: string; downloadedAt: string; cards: OfflineCard[] };
      const meta = await getMeta();
      // Another account on this device: nothing of the previous one stays.
      if (meta && meta.userId !== pack.userId) await clearOfflineData();
      // With reviews still unsent, the local schedule is newer than the server's: keep it.
      if ((await getQueue()).length === 0) await saveDownload({ userId: pack.userId, downloadedAt: pack.downloadedAt }, pack.cards);
      setNeedsLogin(false);
      await reload();
    } catch {
      setStatus("Não foi possível sincronizar agora. As revisões continuam guardadas no aparelho.");
    } finally {
      setBusy(false);
    }
  }, [reload]);

  React.useEffect(() => {
    if (typeof indexedDB === "undefined") {
      setSupported(false);
      return;
    }
    setOnline(navigator.onLine);
    void reload().then(() => syncAndDownload());
    const on = () => {
      setOnline(true);
      void syncAndDownload();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [reload, syncAndDownload]);

  const due = dueNow(cards, Date.now());
  const card = due[0];

  const rate = async (rating: Rating) => {
    if (!card) return;
    const now = new Date();
    const { next } = reviewCard(toSchedule(card), rating, now);
    const updated: OfflineCard = { ...card, state: next.state, intervalDays: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses, learningStep: next.learningStep, dueAt: next.dueAt.toISOString(), lastReviewedAt: now.toISOString() };
    const review: QueuedReview = { clientId: crypto.randomUUID(), flashcardId: card.id, rating, reviewedAt: now.toISOString(), durationMs: Math.min(30 * 60_000, Date.now() - shownAt.current) };
    await recordReview(updated, review);
    setRevealed(false);
    shownAt.current = Date.now();
    await reload();
    if (navigator.onLine && queue.length + 1 >= 10) void syncAndDownload();
  };

  if (!supported) return <Notice tone="warning">Este navegador não permite guardar cartões no aparelho.</Notice>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-fg-subtle">
        <Badge tone={online ? "positive" : "warning"}>{online ? "Conectado" : "Sem conexão"}</Badge>
        <span>{downloadedAt ? `Cartões baixados em ${new Date(downloadedAt).toLocaleString("pt-BR")}` : "Nenhum cartão baixado ainda"}</span>
        <span>{queue.length ? `${queue.length} ${queue.length === 1 ? "revisão aguardando" : "revisões aguardando"} sincronização` : "Tudo sincronizado"}</span>
        {online && (
          <Button size="sm" variant="ghost" loading={busy} onClick={() => void syncAndDownload()}>
            Sincronizar agora
          </Button>
        )}
      </div>
      {status && <p className="text-sm text-fg-muted">{status}</p>}
      {needsLogin && (
        <Notice tone="warning" title="Entre na sua conta para sincronizar">
          As revisões feitas offline continuam guardadas no aparelho. <Link href="/entrar?next=/revisao-offline" className="underline underline-offset-4">Entrar</Link>
        </Notice>
      )}

      {!card ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <h2 className="text-xl font-semibold">{cards.length ? "Nenhum cartão vencido agora" : "Nenhum cartão no aparelho"}</h2>
          <p className="text-base text-fg-muted">
            {cards.length
              ? `${cards.length} cartões guardados, incluindo os de amanhã. Eles aparecem aqui quando vencerem.`
              : "Com conexão, esta tela baixa os cartões vencidos e os de amanhã para você revisar sem internet."}
          </p>
        </div>
      ) : (
        <>
          <p className="numeral text-sm text-fg-subtle">{due.length === 1 ? "1 cartão vencido" : `${due.length} cartões vencidos`}</p>
          <article className="flex min-h-[18rem] flex-col rounded-[var(--radius-panel)] bg-surface" aria-live="polite">
            <div className="flex flex-1 flex-col gap-6 px-6 py-8">
              <p className="whitespace-pre-line text-lg leading-relaxed text-fg">{card.front}</p>
              {revealed && <p className="whitespace-pre-line border-t pt-6 text-md leading-relaxed text-fg-muted">{card.back}</p>}
            </div>
          </article>
          <p className="text-xs text-fg-subtle">Fórmulas e figuras aparecem como texto no modo offline.</p>
          {!revealed ? (
            <Button variant="primary" size="lg" className="self-start" onClick={() => setRevealed(true)}>
              Mostrar resposta
            </Button>
          ) : (
            <div role="group" aria-label="Como foi a lembrança?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => void rate(r)}
                  className={cn("flex flex-col items-center gap-0.5 rounded-[var(--radius-object)] px-3 py-3 shadow-[inset_0_0_0_1px_var(--line)]")}
                >
                  <span className="text-base font-medium text-fg">{REVIEW_RATING_LABEL[r]}</span>
                  <span className="text-sm text-fg-subtle">{previewIntervals(toSchedule(card), new Date())[r]}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
