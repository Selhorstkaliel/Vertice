import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader } from "@/components/ui/display";
import { AnalysisPanel } from "@/components/routine/analysis-panel";
import { EnergyEditor } from "@/components/routine/energy-editor";
import { WeekEditor } from "@/components/routine/week-editor";
import { requireOnboardedUser } from "@/modules/auth/session";
import { analyzeUserRoutine } from "@/modules/routine/service";
import { localNow, startOfWeek } from "@/lib/time";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Minha rotina" };

export default async function RoutinePage({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const user = await requireOnboardedUser();
  const { inicio } = await searchParams;
  const tz = user.profile.timezone;
  const weekStart = startOfWeek(localNow(tz).key);

  const plan = await db.studyPlan.findUnique({
    where: { userId_weekStart: { userId: user.id, weekStart: new Date(`${weekStart}T00:00:00Z`) } },
    select: { id: true, plannedMinutes: true },
  });
  const [{ blocks, energy, analysis }, energyRows] = await Promise.all([
    analyzeUserRoutine(user.id, user.profile, weekStart, plan?.plannedMinutes ?? null),
    db.energyPeriod.findMany({ where: { userId: user.id }, select: { period: true, learnedDelta: true, learnedEvidence: true } }),
  ]);
  const learned = energyRows.map((r) => ({ period: r.period, delta: r.learnedDelta, reason: ((r.learnedEvidence ?? {}) as { reason?: string | null }).reason ?? null }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Minha rotina"
        description="Cadastre compromissos e horários. O tempo que sobra vira janelas de estudo, classificadas pela sua energia."
        actions={
          <Button asChild variant={blocks.length && !plan ? "primary" : "secondary"}>
            <Link href="/plano">{plan ? "Ver plano da semana" : "Gerar plano"}</Link>
          </Button>
        }
      />

      {inicio && blocks.length === 0 && (
        <Notice tone="info" title="Comece pelos compromissos fixos">
          Adicione sono, trabalho, faculdade e deslocamentos. Horários sem bloco entre 06:00 e 23:30 são considerados livres para estudo.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-10">
          <WeekEditor
            blocks={blocks.map((b) => ({
              id: b.id,
              dayOfWeek: b.dayOfWeek,
              startMinute: b.startMinute,
              endMinute: b.endMinute,
              category: b.category,
              label: b.label ?? null,
              isFixed: b.isFixed,
              energy: b.energy,
            }))}
            windowsByDay={analysis.windowsByDay}
          />
          <section aria-labelledby="energy-title" className="flex max-w-xl flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="energy-title" className="text-md font-semibold">
                Energia por período
              </h2>
              <p className="text-base text-fg-muted">
                Como você costuma se sentir em cada parte do dia. Define quais janelas recebem conteúdo exigente.
              </p>
            </div>
            <EnergyEditor energy={energy} learning={{ enabled: user.profile.energyLearning, periods: learned }} />
          </section>
        </div>
        <aside className="min-w-0">
          <AnalysisPanel analysis={analysis} />
        </aside>
      </div>
    </div>
  );
}
