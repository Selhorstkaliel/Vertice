import type { Metadata } from "next";
import { RichText } from "@/components/questions/rich-text";
import { questionFigures } from "@/lib/question-content";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Metric, SectionTitle } from "@/components/ui/display";
import { FlashcardFormDialog } from "@/components/flashcards/flashcard-form-dialog";
import { FlashcardDangerZone } from "@/components/flashcards/flashcard-danger-zone";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getFlashcardDetail } from "@/modules/flashcards/service";
import { getAuthoringOptions } from "@/modules/questions/queries";
import { DIFFICULTY_LABEL, FLASHCARD_TYPE_LABEL, REVIEW_RATING_LABEL } from "@/lib/labels";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Flashcard" };

const STATE_LABEL = { NEW: "Novo", LEARNING: "Em aprendizagem", RELEARNING: "Reaprendizagem", REVIEW: "Em revisão" } as const;

function intervalText(days: number) {
  if (days <= 0) return "—";
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${formatNumber(days, 1)} ${days === 1 ? "dia" : "dias"}`;
}

export default async function FlashcardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const [card, options] = await Promise.all([getFlashcardDetail(user.id, id), getAuthoringOptions(user.id)]);
  if (!card) notFound();
  const tz = user.profile.timezone;

  return (
    <div className="flex flex-col gap-8">
      <Link href="/flashcards" className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg">
        <ChevronLeft className="size-4" />
        Flashcards
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{FLASHCARD_TYPE_LABEL[card.type]}</h1>
          <div className="flex flex-wrap gap-2">
            {card.subject && <Badge tone="outline">{card.subject.name}{card.topic ? ` › ${card.topic.name}` : ""}</Badge>}
            {card.examBoard && <Badge tone="outline">{card.examBoard.name}</Badge>}
            {card.competition && <Badge tone="outline">{card.competition.name}</Badge>}
            {card.difficulty && <Badge tone="outline">{DIFFICULTY_LABEL[card.difficulty]}</Badge>}
            {card.suspended && <Badge tone="warning">Suspenso</Badge>}
            {card.tags.map((t) => (
              <Badge key={t} tone="neutral">
                #{t}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {card.sourceQuestion && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/questoes/${card.sourceQuestion.id}`}>Ver questão de origem</Link>
            </Button>
          )}
          <FlashcardFormDialog
            subjects={options.subjects}
            boards={options.boards}
            competitions={options.competitions}
            cardId={card.id}
            initial={{
              front: card.front,
              back: card.back,
              type: card.type,
              subjectId: card.subjectId ?? "",
              topicId: card.topicId ?? "",
              examBoardId: card.examBoardId ?? "",
              competitionId: card.competitionId ?? "",
              difficulty: card.difficulty ?? "",
              tags: card.tags.join(", "),
              isBoardPattern: card.isBoardPattern,
              patternEvidence: card.patternEvidence ?? "",
            }}
            trigger={
              <Button size="sm" variant="secondary">
                <Pencil />
                Editar
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-[var(--radius-object)] bg-surface p-5">
          <h2 className="text-sm text-fg-subtle">Frente</h2>
          <RichText text={card.front} figures={questionFigures(card.sourceQuestion?.figures)} className="text-md leading-relaxed text-fg" />
        </section>
        <section className="flex flex-col gap-2 rounded-[var(--radius-object)] bg-surface p-5">
          <h2 className="text-sm text-fg-subtle">Verso</h2>
          <RichText text={card.back} figures={questionFigures(card.sourceQuestion?.figures)} className="text-md leading-relaxed text-fg-muted" />
        </section>
      </div>

      {card.isBoardPattern && (
        <p className="max-w-3xl text-base text-fg-muted">
          <span className="font-medium text-fg">Padrão de cobrança observado. </span>
          Evidência registrada: {card.patternEvidence}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <SectionTitle>Agendamento</SectionTitle>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Estado" value={STATE_LABEL[card.state]} size="sm" />
          <Metric label="Próxima revisão" value={card.state === "NEW" ? "Na fila de novos" : formatDateTime(card.dueAt, tz)} size="sm" />
          <Metric label="Intervalo atual" value={intervalText(card.intervalDays)} size="sm" />
          <Metric label="Facilidade" value={formatNumber(card.ease, 2)} size="sm" detail="Multiplicador do intervalo" />
          <Metric label="Revisões" value={formatNumber(card.reps)} size="sm" />
          <Metric label="Esquecimentos" value={formatNumber(card.lapses)} size="sm" />
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Histórico</SectionTitle>
        {card.reviews.length === 0 ? (
          <p className="text-base text-fg-muted">Este cartão ainda não foi revisado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <caption className="sr-only">Histórico de revisões</caption>
              <thead>
                <tr className="text-sm text-fg-subtle">
                  <th className="pb-2 font-normal">Data</th>
                  <th className="pb-2 font-normal">Resposta</th>
                  <th className="pb-2 text-right font-normal">Intervalo antes</th>
                  <th className="pb-2 text-right font-normal">Intervalo depois</th>
                  <th className="pb-2 text-right font-normal">Facilidade</th>
                </tr>
              </thead>
              <tbody>
                {card.reviews.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft">
                    <td className="numeral py-2 text-base text-fg-muted">{formatDateTime(r.reviewedAt, tz)}</td>
                    <td className="py-2 text-base text-fg">{REVIEW_RATING_LABEL[r.rating]}</td>
                    <td className="numeral py-2 text-right text-base text-fg-muted">{intervalText(r.intervalBefore)}</td>
                    <td className="numeral py-2 text-right text-base text-fg">{intervalText(r.intervalAfter)}</td>
                    <td className="numeral py-2 text-right text-base text-fg-muted">{formatNumber(r.easeAfter, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FlashcardDangerZone id={card.id} suspended={card.suspended} />
    </div>
  );
}
