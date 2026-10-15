import type { Metadata } from "next";
import Link from "next/link";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { MissionDurationPicker, MissionRunner } from "@/components/mission/mission-runner";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getMissionView } from "@/modules/mission/service";
import { streakFor } from "@/modules/performance/metrics";
import { localNow } from "@/lib/time";
import { formatNumber, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Missão do dia" };

export default async function MissionPage() {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const view = await getMissionView(user.id, tz, user.profile.missionMinutes);
  const estMinutes = Math.max(1, Math.round(view.plan.estSeconds / 60));

  if (view.completedAt) {
    const streak = await streakFor(user.id, tz, localNow(tz).key);
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Missão do dia" description="Concluída. A próxima fica pronta amanhã." />
        <EmptyState
          icon={<Target />}
          title="Missão cumprida"
          description={`Sequência atual: ${formatNumber(streak)} ${streak === 1 ? "dia" : "dias"}. Quer continuar? Revise mais flashcards ou resolva questões livremente.`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="primary">
                <Link href="/painel">Voltar ao painel</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/questoes">Banco de questões</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const leftOver = view.plan.leftOver;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Missão do dia"
        description={`Cerca de ${estMinutes} min, montada com o que está vencido e com o seu ponto mais fraco.`}
        actions={<MissionDurationPicker value={view.targetMinutes} />}
      />

      {view.plan.blocks.length > 0 && (
        <ul className="-mt-4 flex flex-col gap-1.5 text-base text-fg-muted">
          {view.plan.blocks.map((b) => (
            <li key={b.kind}>
              <span className="font-medium text-fg">
                {b.kind === "FLASHCARDS"
                  ? plural(b.cardIds.length, "flashcard", "flashcards")
                  : b.kind === "ERRORS"
                    ? plural(b.entryIds.length, "erro do caderno", "erros do caderno")
                    : `${plural(b.questions, "questão", "questões")} de ${b.topicName}`}
              </span>{" "}
              (~{Math.max(1, Math.round(b.estSeconds / 60))} min). {b.reason}
            </li>
          ))}
        </ul>
      )}

      {(leftOver.cards > 0 || leftOver.errors > 0) && (
        <p className="-mt-4 text-sm text-fg-subtle">
          Ficaram fora por causa do tempo:{" "}
          {[leftOver.cards ? plural(leftOver.cards, "flashcard", "flashcards") : null, leftOver.errors ? plural(leftOver.errors, "erro", "erros") : null].filter(Boolean).join(" e ")}. Eles continuam em
          Flashcards e no Caderno de Erros.
        </p>
      )}

      {view.total === 0 ? (
        view.plan.blocks.some((b) => b.kind === "TOPIC") ? (
          <Notice tone="info" title="Sem questões cadastradas para este tópico">
            Use os minutos da missão para estudar o tópico sugerido com uma sessão cronometrada.
            <span className="mt-3 block">
              <Button asChild size="sm" variant="primary">
                <Link href="/sessao">Iniciar sessão de estudo</Link>
              </Button>
            </span>
          </Notice>
        ) : (
          <EmptyState
            icon={<Target />}
            title="Nada para montar a missão ainda"
            description="A missão usa os flashcards, o caderno de erros e o edital do seu concurso. Adicione um concurso para começar com as questões do tópico de maior prioridade."
            action={
              <Button asChild variant="primary">
                <Link href="/concursos">Meus concursos</Link>
              </Button>
            }
          />
        )
      ) : (
        <MissionRunner view={view} />
      )}
    </div>
  );
}
