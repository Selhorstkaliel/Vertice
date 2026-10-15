import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { StagesEditor } from "@/components/competitions/competition-controls";
import { TafSafetyNotice, TafTestCard, TafTestDialog } from "@/components/military/taf-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getMilitaryEnrollments, getTafTests, type MilitaryEnrollmentView } from "@/modules/military/service";
import { syncStageItems } from "@/modules/military/stages";
import { localNow } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Preparação Militar" };

const TABS = [
  { key: "etapas", label: "Etapas do concurso" },
  { key: "taf", label: "TAF" },
] as const;

const dateBr = (key: string) => key.split("-").reverse().join("/");

function StageSummary({ enrollment, today }: { enrollment: MilitaryEnrollmentView; today: string }) {
  const stages = enrollment.stages.filter((s) => s.status !== "NOT_APPLICABLE");
  const passed = stages.filter((s) => s.status === "PASSED").length;
  const failed = stages.find((s) => s.status === "FAILED");
  const next = stages.find((s) => s.status === "PENDING" || s.status === "IN_PROGRESS");
  const upcoming = stages.filter((s) => s.date && s.date >= today && s.status !== "PASSED" && s.status !== "FAILED").sort((a, b) => (a.date! < b.date! ? -1 : 1))[0];

  if (stages.length === 0) return <p className="text-base text-fg-muted">Cadastre as etapas previstas no edital deste concurso.</p>;
  return (
    <p className="text-base text-fg-muted">
      {passed} de {stages.length} etapas concluídas com aprovação.
      {failed ? ` Etapa “${failed.name}” marcada como não aprovada.` : next ? ` Próxima: ${next.name}${next.status === "IN_PROGRESS" ? " (em andamento)" : ""}.` : ""}
      {upcoming ? ` Data mais próxima: ${upcoming.name} em ${dateBr(upcoming.date!)}.` : ""}
    </p>
  );
}

export default async function MilitaryPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireOnboardedUser();
  const { aba } = await searchParams;
  const tab = aba === "taf" ? "taf" : "etapas";
  const today = localNow(user.profile.timezone).key;
  if (tab === "etapas") await syncStageItems(user.id);
  const [enrollments, tests] = await Promise.all([getMilitaryEnrollments(user.id), tab === "taf" ? getTafTests(user.id, today) : Promise.resolve([])]);
  const options = enrollments.map((e) => ({ id: e.id, title: e.title }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Preparação Militar"
        description="Etapas do concurso e acompanhamento do teste de aptidão física, separados do conteúdo acadêmico."
        actions={tab === "taf" && tests.length > 0 ? <TafTestDialog enrollments={options} /> : null}
      />

      <nav aria-label="Seções da preparação militar" className="-mt-4 flex gap-6 hairline-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "etapas" ? "/militar" : "/militar?aba=taf"}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "relative -mb-px pb-3 text-base font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-px",
              tab === t.key ? "text-fg after:bg-fg" : "text-fg-subtle hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "etapas" ? (
        enrollments.length === 0 ? (
          <EmptyState
            icon={<Flag />}
            title="Nenhum concurso militar na sua lista"
            description="Adicione um concurso militar para acompanhar inscrição, provas, inspeção de saúde, TAF, avaliação psicológica e demais etapas."
            action={
              <Button asChild variant="primary">
                <Link href="/concursos">Ver concursos</Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-10">
            <Notice tone="warning" title="Confirme no edital oficial">
              As etapas sugeridas são um modelo geral e cada concurso pode ter etapas diferentes. Ajuste nomes, ordem e datas conforme o edital. Em cada etapa, marque documentos, exames e
              prazos já cumpridos; os prazos aparecem no calendário e geram lembretes 7, 3 e 1 dia antes.
            </Notice>
            {enrollments.map((e) => (
              <section key={e.id} aria-labelledby={`stages-${e.id}`} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id={`stages-${e.id}`} className="text-lg font-semibold tracking-[-0.01em]">
                    {e.title}
                    {e.isPrimary && <span className="ml-2 text-sm font-normal text-fg-subtle">Principal</span>}
                  </h2>
                  <Link href={`/concursos/${e.competitionId}`} className="text-sm text-info underline-offset-4 hover:underline">
                    Detalhes do concurso
                  </Link>
                </div>
                <StageSummary enrollment={e} today={today} />
                <StagesEditor enrollmentId={e.id} stages={e.stages} today={today} />
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-8">
          <TafSafetyNotice />
          {tests.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="Nenhuma prova cadastrada"
              description="Cadastre as provas do seu TAF, como corrida, barra, flexão, abdominal ou natação, com a meta do edital. Depois registre cada resultado para ver a evolução."
              action={<TafTestDialog enrollments={options} />}
            />
          ) : (
            <div className="flex flex-col gap-10">
              {tests.map((t) => (
                <TafTestCard key={t.id} test={t} enrollments={options} today={today} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
