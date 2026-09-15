import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { SimulationControls } from "@/components/simulations/simulation-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { listSimulations } from "@/modules/simulations/service";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { formatDateShort, formatPercent, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Simulados" };

export default async function SimulationsPage() {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const simulations = await listSimulations(user.id);

  const newButton = (
    <Button asChild variant="primary">
      <Link href="/simulados/novo">
        <Plus />
        Novo simulado
      </Link>
    </Button>
  );

  if (simulations.length === 0) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Simulados" actions={newButton} />
        <EmptyState
          icon={<Timer />}
          title="Nenhum simulado realizado"
          description="Monte um simulado por concurso, banca, matérias, quantidade e tempo. O resultado mostra onde você perde mais pontos e o que priorizar."
          action={newButton}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Simulados" description="Treino em condição de prova, com cronômetro, navegação e revisão antes de finalizar." actions={newButton} />
      <ul className="grid gap-3 md:grid-cols-2">
        {simulations.map((s) => {
          const open = s.attempts.find((a) => a.status === "IN_PROGRESS");
          const finished = s.attempts.filter((a) => a.status !== "IN_PROGRESS");
          const last = finished[0];
          const best = finished.reduce<number | null>((m, a) => (a.score !== null && (m === null || a.score > m) ? a.score : m), null);
          return (
            <li key={s.id}>
              <Card className="relative flex h-full flex-col gap-4 p-5">
                {open && <span aria-hidden="true" className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-performance" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="truncate text-lg font-semibold tracking-[-0.015em]">{s.title}</h2>
                    <p className="text-sm text-fg-subtle">
                      {plural(s._count.questions, "questão", "questões")}
                      {s.timeLimitMinutes ? `, ${s.timeLimitMinutes} min` : ", sem tempo limite"}
                      {s.difficulty ? `, ${DIFFICULTY_LABEL[s.difficulty].toLowerCase()}` : ""}
                    </p>
                    <p className="truncate text-sm text-fg-subtle">
                      {[s.competition?.name, s.examBoard?.name].filter(Boolean).join(", ") || "Sem concurso ou banca definidos"}. {s.subjects.map((x) => x.subject.name).join(", ")}
                    </p>
                  </div>
                  {open && <Badge tone="performance">Em andamento</Badge>}
                </div>
                <dl className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <dd className="numeral text-lg text-fg">{last?.score !== undefined && last?.score !== null ? formatPercent(last.score) : "—"}</dd>
                    <dt className="text-sm text-fg-subtle">Último resultado</dt>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dd className="numeral text-lg text-fg">{formatPercent(best)}</dd>
                    <dt className="text-sm text-fg-subtle">Melhor</dt>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dd className="numeral text-lg text-fg">{finished.length}</dd>
                    <dt className="text-sm text-fg-subtle">{finished.length === 1 ? "Tentativa" : "Tentativas"}</dt>
                  </div>
                </dl>
                {finished.length > 0 && (
                  <ul className="flex flex-col text-sm">
                    {finished.slice(0, 3).map((a) => (
                      <li key={a.id} className="flex justify-between gap-3 border-t border-line-soft py-1.5">
                        <Link href={`/simulados/resultado/${a.id}`} className="text-fg-muted hover:text-fg hover:underline hover:underline-offset-4">
                          {a.finishedAt ? formatDateShort(a.finishedAt, tz) : "—"}
                          {a.status === "EXPIRED" ? ", tempo esgotado" : ""}
                        </Link>
                        <span className="numeral text-fg">{formatPercent(a.score)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto">
                  <SimulationControls simulationId={s.id} title={s.title} hasOpenAttempt={!!open} />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
