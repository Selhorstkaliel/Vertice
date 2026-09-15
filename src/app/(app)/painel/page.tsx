import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Progress, SectionTitle } from "@/components/ui/display";
import { CountdownBand } from "@/components/dashboard/countdown-band";
import { ReadinessSummary } from "@/components/dashboard/readiness";
import { PlanItemRow } from "@/components/plan/plan-item-row";
import { GeneratePlanButton } from "@/components/plan/plan-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getDashboard } from "@/modules/dashboard/queries";
import { listGoals } from "@/modules/goals/service";
import { goalTitle } from "@/modules/goals/format";
import { GoalProgress } from "@/components/goals/goal-row";
import { firstName, formatMinutes, formatNumber, formatPercent, greeting, plural } from "@/lib/format";
import { addDays, startOfWeek } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function Reading({
  label,
  value,
  unit,
  detail,
  href,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <dd className="flex items-baseline gap-1">
        <span className="numeral text-xl font-medium text-fg">{value}</span>
        {unit && <span className="text-sm text-fg-subtle">{unit}</span>}
      </dd>
      <dt className="text-sm text-fg-subtle">{label}</dt>
      {detail && <dd className="text-xs text-fg-subtle">{detail}</dd>}
    </>
  );
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 bg-canvas px-4 py-4 sm:px-6 lg:px-4", className)}>
      {href ? (
        <Link href={href} className="flex flex-col gap-0.5 rounded-[var(--radius-control)] hover:[&_dd_span:first-child]:underline hover:[&_dd_span:first-child]:underline-offset-4">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const [data, goals] = await Promise.all([getDashboard(user), listGoals(user.id, user.profile.timezone)]);
  const activeGoals = goals.filter((g) => g.isActive).slice(0, 4);
  const m = data.metrics;
  const weekGoal = m.weeklyTargetMinutes;
  const remainingDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(data.today), i)).filter((d) => d >= data.today);

  const todayPlanned = data.todayItems.filter((i) => !["CANCELED", "SKIPPED"].includes(i.status));
  const todayDone = todayPlanned.filter((i) => i.status === "DONE").length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-8 max-lg:order-1">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl sm:leading-tight">
          {greeting(data.hour)}, {firstName(user.name)}.
        </h1>
        {data.exam ? (
          <CountdownBand exam={data.exam} prepElapsed={data.prepElapsed} />
        ) : (
          <Notice tone="warning" title="Nenhum concurso principal" action={<Button asChild size="sm"><Link href="/concursos">Escolher concurso</Link></Button>}>
            O plano, a prioridade do dia e o índice de preparação dependem do concurso principal.
          </Notice>
        )}
      </header>

      {/* Instrument row — readings, not cards */}
      <dl className="-mx-4 grid grid-cols-2 gap-px border-y bg-line-soft max-lg:order-3 sm:-mx-6 lg:-mx-4 lg:grid-cols-5">
        <Reading label="Estudado hoje" value={formatMinutes(m.minutesToday)} />
        <Reading
          label="Na semana"
          value={formatMinutes(m.minutesWeek)}
          detail={
            weekGoal ? (
              <span className="flex flex-col gap-1.5 pt-1">
                <Progress value={m.minutesWeek} max={weekGoal} tone={m.minutesWeek >= weekGoal ? "positive" : "neutral"} size="xs" label="Meta semanal" />
                Meta semanal: {formatMinutes(weekGoal)}
              </span>
            ) : undefined
          }
          href="/plano"
        />
        <Reading label="Questões na semana" value={formatNumber(m.weekQuestions)} href="/questoes" />
        <Reading
          label="Acertos em 30 dias"
          value={formatPercent(m.accuracy30)}
          detail={m.accuracy30 === null ? (m.answered30 ? `${m.answered30} questões — mínimo de 10` : "Sem questões") : `${formatNumber(m.answered30)} questões`}
          href="/desempenho"
        />
        <Reading label="Sequência" value={formatNumber(m.streak)} unit={m.streak === 1 ? "dia" : "dias"} />
        <Reading label="Flashcards pendentes" value={formatNumber(m.flashDue)} href="/flashcards" />
        <Reading label="Revisões pendentes" value={formatNumber(m.reviewsDue)} href="/edital?filtro=revisar" />
        <Reading label="Edital estudado" value={formatPercent(m.coverage)} href="/edital" />
        <Reading
          label="Índice de preparação"
          value={data.readiness?.value !== null && data.readiness?.value !== undefined ? String(data.readiness.value) : "—"}
          unit="/100"
          href="/desempenho"
        />
        <Reading
          label="Recomendações"
          value={formatNumber(data.pendingRecommendations)}
          detail={data.pendingRecommendations ? "Aguardando sua decisão" : undefined}
          href="/mentor"
        />
      </dl>

      {/* On phones the day's sessions come before the readings (§55). */}
      <div className="grid gap-12 max-lg:order-2 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <section aria-labelledby="today-title" className="flex min-w-0 flex-col">
          <SectionTitle
            action={
              todayPlanned.length > 0 ? (
                <span className="numeral text-sm text-fg-subtle">
                  {todayDone} de {plural(todayPlanned.length, "sessão", "sessões")}
                </span>
              ) : undefined
            }
          >
            <span id="today-title">Hoje</span>
          </SectionTitle>
          {!data.hasPlan ? (
            <EmptyState
              icon={<CalendarCheck2 />}
              title="Plano da semana ainda não gerado"
              description="Gere o plano para ver o cronograma de hoje: teoria, questões, revisões e flashcards nos seus horários livres."
              action={
                data.enrollmentsActive > 0 ? (
                  <>
                    <GeneratePlanButton hasPlan={false} />
                    <Button asChild variant="ghost">
                      <Link href="/rotina">Revisar rotina</Link>
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="primary">
                    <Link href="/concursos">
                      <Flag />
                      Adicionar concurso
                    </Link>
                  </Button>
                )
              }
              className="py-6"
            />
          ) : data.todayItems.length === 0 ? (
            <EmptyState
              title="Nenhuma sessão hoje"
              description="Não há horários livres ou sessões planejadas para hoje. Você pode registrar um estudo manualmente ou recalcular o plano."
              action={
                <Button asChild variant="secondary">
                  <Link href="/plano">Ver plano da semana</Link>
                </Button>
              }
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-line-soft border-t">
              {data.todayItems.map((item) => (
                <PlanItemRow key={item.id} item={item} remainingDays={remainingDays} compact />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="priority-title" className="flex flex-col gap-3">
            <h2 id="priority-title" className="text-md font-semibold">
              Prioridade atual
            </h2>
            {data.priority ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xl font-semibold tracking-[-0.02em] text-fg">{data.priority.subjectName}</p>
                  <p className="text-md text-fg-muted">{data.priority.topicName}</p>
                </div>
                <p className="flex items-baseline gap-2">
                  <span className="text-sm text-fg-subtle">Índice atual</span>
                  <span className="numeral text-lg text-fg">
                    {data.priority.topicAccuracy !== null ? formatPercent(data.priority.topicAccuracy) : data.priority.subjectAccuracy !== null ? formatPercent(data.priority.subjectAccuracy) : "—"}
                  </span>
                  {data.priority.topicAccuracy === null && data.priority.subjectAccuracy === null && <span className="text-sm text-fg-subtle">sem questões respondidas</span>}
                </p>
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-fg-subtle">Motivo</p>
                  <ul className="flex flex-col gap-1.5">
                    {data.priority.reasons.map((r) => (
                      <li key={r.code} className="text-base text-fg-muted">
                        {r.text}
                      </li>
                    ))}
                  </ul>
                  {data.priority.weightUnconfirmed && (
                    <p className="text-sm text-fg-subtle">Pesos do edital não confirmados: todas as disciplinas são tratadas com o mesmo peso.</p>
                  )}
                </div>
                {data.priority.next.length > 0 && (
                  <div className="flex flex-col gap-1 border-t pt-3">
                    <p className="text-sm text-fg-subtle">Em seguida</p>
                    {data.priority.next.map((n) => (
                      <p key={n.subjectName} className="flex justify-between gap-3 text-base">
                        <span className="truncate text-fg-muted">
                          {n.subjectName} — {n.topicName}
                        </span>
                        <span className="numeral shrink-0 text-fg-subtle">{n.accuracy !== null ? formatPercent(n.accuracy) : "—"}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-base text-fg-muted">Sem conteúdos no edital dos concursos ativos. Adicione disciplinas em Meus Concursos.</p>
            )}
          </section>

          {activeGoals.length > 0 && (
            <section aria-labelledby="goals-title" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="goals-title" className="text-md font-semibold">
                  Metas
                </h2>
                <Link href="/metas" className="text-sm text-fg-subtle hover:text-fg">
                  Ver todas
                </Link>
              </div>
              <ul className="flex flex-col gap-4">
                {activeGoals.map((g) => (
                  <li key={g.id} className="flex flex-col gap-1.5">
                    <span className="text-base text-fg-muted">{goalTitle(g)}</span>
                    <GoalProgress goal={g} compact />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.exam && data.readiness && (
            <section aria-labelledby="readiness-title" className="flex flex-col gap-3">
              <h2 id="readiness-title" className="text-md font-semibold">
                Índice de Preparação
              </h2>
              <ReadinessSummary readiness={data.readiness} competitionName={data.exam.title} />
            </section>
          )}

          {data.coverageBySubject.length > 0 && (
            <section aria-labelledby="coverage-title" className="flex flex-col gap-3">
              <h2 id="coverage-title" className="text-md font-semibold">
                Progresso do edital
              </h2>
              <ul className="flex flex-col gap-3">
                {data.coverageBySubject.map((s) => (
                  <li key={s.subjectId} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-base text-fg">{s.subjectName}</span>
                      <span className="numeral text-base text-fg-muted">{formatPercent(s.coverage)}</span>
                    </div>
                    <Progress value={s.coverage} tone="neutral" size="xs" label={`Edital de ${s.subjectName}`} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
