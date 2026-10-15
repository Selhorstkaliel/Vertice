"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { ReviewSession } from "@/components/flashcards/review-session";
import { QuestionPlayer } from "@/components/questions/question-player";
import { completeMissionAction, setMissionMinutesAction } from "@/modules/mission/actions";
import type { MissionQuestion, MissionView } from "@/modules/mission/service";

type Step = { kind: "cards" } | { kind: "error"; q: MissionQuestion & { entryId: string } } | { kind: "topic"; q: MissionQuestion };

export function MissionDurationPicker({ value }: { value: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Segmented<string>
      aria-label="Duração da missão"
      value={String(value)}
      onValueChange={(v) =>
        startTransition(async () => {
          const r = await setMissionMinutesAction(Number(v));
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        })
      }
      options={[15, 20, 30].map((m) => ({ value: String(m), label: `${m} min` }))}
      className={pending ? "opacity-60" : undefined}
    />
  );
}

function QuestionContext({ q }: { q: MissionQuestion }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-subtle">
      <span>
        {q.subjectName}
        {q.topicName ? ` › ${q.topicName}` : ""}
      </span>
      {q.generated ? <Badge tone="info">Gerada por IA</Badge> : <span>{q.sourceLabel}</span>}
    </p>
  );
}

export function MissionRunner({ view }: { view: MissionView }) {
  const router = useRouter();
  const steps = React.useMemo<Step[]>(
    () => [
      ...(view.cards.length ? [{ kind: "cards" as const }] : []),
      ...view.errorQuestions.map((q) => ({ kind: "error" as const, q })),
      ...view.topicQuestions.map((q) => ({ kind: "topic" as const, q })),
    ],
    [view],
  );
  const [index, setIndex] = React.useState(0);
  const [doneNow, setDoneNow] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const step = steps[index];
  const done = Math.min(view.total, view.done + doneNow);

  const advance = (items: number) => {
    setDoneNow((d) => d + items);
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
  };

  const complete = () =>
    startTransition(async () => {
      const r = await completeMissionAction();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });

  const header = (
    <div className="flex items-center gap-4">
      <Progress value={done} max={Math.max(1, view.total)} tone="neutral" size="xs" label="Progresso da missão" className="flex-1" />
      <span className="numeral text-sm text-fg-subtle">
        {done} de {view.total}
      </span>
    </div>
  );

  if (!step) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col items-start gap-3 py-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Check className="size-5 text-positive" aria-hidden="true" />
            Tudo feito
          </h2>
          <p className="text-base text-fg-muted">Conclua a missão para contar o dia na sua sequência.</p>
          <Button variant="primary" size="lg" loading={pending} onClick={complete}>
            Concluir missão
          </Button>
        </div>
      </div>
    );
  }

  const isLastStep = index === steps.length - 1;
  return (
    <div className="flex flex-col gap-6">
      {header}
      {step.kind === "cards" && (
        <section aria-label="Flashcards" className="flex flex-col gap-3">
          <h2 className="text-md font-semibold">Flashcards vencidos</h2>
          <ReviewSession cards={view.cards} onFinish={() => advance(view.cards.length)} />
        </section>
      )}
      {step.kind !== "cards" && (
        <section aria-label={step.kind === "error" ? "Caderno de erros" : "Questões do tópico"} className="flex flex-col gap-3" key={step.q.id}>
          <div className="flex flex-col gap-1">
            <h2 className="text-md font-semibold">{step.kind === "error" ? "Refazer erro do caderno" : "Questão do tópico"}</h2>
            <QuestionContext q={step.q} />
          </div>
          <QuestionPlayer
            question={step.q}
            nextHref={null}
            onNext={() => advance(1)}
            nextLabel={isLastStep ? "Finalizar" : "Próximo item"}
            reviewOfEntryId={step.kind === "error" ? step.q.entryId : undefined}
            afterAnswer={null}
          />
        </section>
      )}
      <p className="text-sm text-fg-subtle">
        Pode sair e voltar: o que já foi feito fica registrado. <Link href="/painel" className="underline underline-offset-4 hover:text-fg">Voltar ao painel</Link>
      </p>
    </div>
  );
}
