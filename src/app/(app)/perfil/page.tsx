import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/display";
import { Avatar } from "@/components/app/app-shell";
import { GoalProgress } from "@/components/goals/goal-row";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getPrimaryEnrollment, competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { getProgress } from "@/modules/progress/service";
import { listGoals } from "@/modules/goals/service";
import { goalTitle } from "@/modules/goals/format";
import { formatCalendarDate, formatDateLong, formatNumber, plural } from "@/lib/format";
import type { AchievementGroup } from "@/engines/progress/achievements";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Perfil" };

const GROUP_ORDER: AchievementGroup[] = ["Estudo", "Constância", "Questões", "Revisão", "Simulados", "Edital", "Metas", "Preparação física"];

export default async function ProfilePage() {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const [progress, primary, goals] = await Promise.all([getProgress(user.id, tz), getPrimaryEnrollment(user.id), listGoals(user.id, tz)]);
  const { stats, level } = progress;
  const activeGoals = goals.filter((g) => g.isActive);
  const hours = Math.floor(stats.studyMinutes / 60);

  const readings: { label: string; value: string; detail?: string }[] = [
    { label: "Dias estudados", value: formatNumber(stats.activeDays), detail: "Dias com pelo menos 10 min de sessão, 5 questões ou 5 revisões" },
    { label: "Horas de estudo", value: `${formatNumber(hours)}h`, detail: stats.studyMinutes % 60 ? `e ${stats.studyMinutes % 60} min` : undefined },
    { label: "Questões", value: formatNumber(stats.questions) },
    { label: "Sequência atual", value: plural(progress.currentStreak, "dia", "dias"), detail: `Recorde: ${plural(stats.bestStreak, "dia", "dias")}` },
  ];

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar name={user.name} src={user.avatarUrl} className="size-20 text-lg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{user.name}</h1>
            <p className="text-base text-fg-muted">
              {primary ? (
                <Link href={`/concursos/${primary.competitionId}`} className="hover:text-fg hover:underline hover:underline-offset-4">
                  {competitionTitle(primary.competition, effectiveExamDate(primary).date)}
                </Link>
              ) : (
                "Sem concurso principal"
              )}
              {primary && effectiveExamDate(primary).date ? `, prova em ${formatCalendarDate(effectiveExamDate(primary).date!)}` : ""}
            </p>
            <p className="text-sm text-fg-subtle">No Vértice desde {formatDateLong(user.createdAt, tz)}</p>
          </div>
        </div>
        <Button asChild variant="secondary">
          <Link href="/configuracoes#conta">Editar perfil e configurações</Link>
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-y py-6 lg:grid-cols-4">
        {readings.map((r) => (
          <div key={r.label} className="flex flex-col gap-1">
            <dt className="text-sm text-fg-subtle">{r.label}</dt>
            <dd className="numeral text-2xl font-light text-fg">{r.value}</dd>
            {r.detail && <dd className="text-sm text-fg-subtle">{r.detail}</dd>}
          </div>
        ))}
      </dl>

      <section aria-labelledby="level-title" className="flex max-w-2xl flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="level-title" className="text-lg font-semibold tracking-[-0.01em]">
            Nível {level.level}
          </h2>
          <span className="numeral text-sm text-fg-subtle">
            {level.nextHours === null ? "Nível máximo" : `${formatNumber(Math.ceil(level.nextHours - level.hours))}h para o nível ${level.level + 1}`}
          </span>
        </div>
        <Progress value={level.progress} tone="info" size="sm" label={`Progresso até o nível ${level.level + 1}`} />
        <p className="text-sm text-fg-subtle">Os níveis sobem apenas com tempo efetivo de estudo registrado em sessões concluídas.</p>
      </section>

      <section aria-labelledby="achievements-title" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="achievements-title" className="text-lg font-semibold tracking-[-0.01em]">
            Marcos pessoais
          </h2>
          <span className="numeral text-sm text-fg-subtle">
            {progress.unlockedCount} de {progress.achievements.length} alcançados
          </span>
        </div>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
          {GROUP_ORDER.map((group) => {
            const list = progress.achievements.filter((a) => a.group === group);
            return (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-fg-subtle">{group}</h3>
                <ul className="flex flex-col">
                  {list.map((a) => (
                    <li key={a.key} className="flex items-start gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                      <span
                        aria-hidden="true"
                        className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", a.unlocked ? "bg-elevated text-fg shadow-[inset_0_0_0_1px_var(--fg-muted)]" : "shadow-[inset_0_0_0_1px_var(--line)]")}
                      >
                        {a.unlocked && <Check className="size-3" strokeWidth={2.5} />}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn("text-base", a.unlocked ? "text-fg" : "text-fg-muted")}>
                          {a.title}
                          <span className="sr-only">{a.unlocked ? " (alcançado)" : " (ainda não alcançado)"}</span>
                        </span>
                        <span className="text-sm text-fg-subtle">
                          {a.unlocked && a.unlockedAt ? `Registrado em ${formatDateLong(new Date(a.unlockedAt), tz)}` : a.description}
                        </span>
                        {!a.unlocked && a.progress > 0 && <Progress value={a.progress} tone="neutral" size="xs" className="mt-1 max-w-48" label={`Progresso em ${a.title}`} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="goals-title" className="flex max-w-2xl flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="goals-title" className="text-lg font-semibold tracking-[-0.01em]">
            Metas ativas
          </h2>
          <Link href="/metas" className="text-sm text-info underline-offset-4 hover:underline">
            {activeGoals.length ? "Gerenciar metas" : "Definir metas"}
          </Link>
        </div>
        {activeGoals.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhuma meta ativa.</p>
        ) : (
          <ul className="flex flex-col">
            {activeGoals.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 border-b border-line-soft py-3 last:border-b-0">
                <span className="text-base text-fg">{goalTitle(g)}</span>
                <GoalProgress goal={g} compact />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
