import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { StagesEditor } from "@/components/competitions/competition-controls";
import { TafSafetyNotice, TafTestCard, TafTestDialog } from "@/components/military/taf-controls";
import { TafSexChooser } from "@/components/military/taf-edital";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getMilitaryEnrollments, getTafStandards, getTafTests, syncTafFromEdital, type MilitaryEnrollmentView, type TafStandardsView } from "@/modules/military/service";
import { syncStageItems } from "@/modules/military/stages";
import { localNow } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Preparação Militar" };

const TABS = [
  { key: "etapas", label: "Etapas do concurso" },
  { key: "taf", label: "TAF" },
] as const;

const dateBr = (key: string) => key.split("-").reverse().join("/");
const SEX_LABEL = { MALE: "Masculino", FEMALE: "Feminino", BOTH: "Ambos" } as const;

function TafStandardsTable({ view, sexKnown }: { view: TafStandardsView; sexKnown: boolean }) {
  if (view.standards.length === 0) {
    return (
      <p className="text-base text-fg-muted">
        {view.title}: os índices do TAF aparecem aqui quando o edital deste concurso for lido e publicado no Vértice.
      </p>
    );
  }
  return (
    <section aria-label={`Índices do TAF de ${view.title}`} className="flex flex-col gap-2">
      <h2 className="text-md font-semibold tracking-[-0.01em]">
        {view.title}: índices do edital{view.year ? ` ${view.year}` : ""}
      </h2>
      <table className="w-full max-w-3xl text-left">
        <thead>
          <tr className="text-sm text-fg-subtle">
            <th className="pb-2 font-normal">Prova</th>
            {!sexKnown && <th className="pb-2 font-normal">Sexo</th>}
            <th className="pb-2 font-normal">Faixa etária</th>
            <th className="pb-2 font-normal">Índice mínimo</th>
          </tr>
        </thead>
        <tbody>
          {view.standards.map((s) => (
            <tr key={s.id} className="border-t border-line-soft">
              <td className="py-2 text-base text-fg">{s.test}</td>
              {!sexKnown && <td className="py-2 text-base text-fg-muted">{SEX_LABEL[s.sex]}</td>}
              <td className="py-2 text-base text-fg-muted">{s.ageRange ?? "—"}</td>
              <td className="py-2 text-base text-fg">
                {s.index} {s.unitText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.sourceUrl && (
        <a href={view.sourceUrl} target="_blank" rel="noreferrer" className="w-fit text-sm text-info underline-offset-4 hover:underline">
          Conferir no edital oficial
        </a>
      )}
    </section>
  );
}

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
  const sex = user.profile.sex;
  if (tab === "etapas") await syncStageItems(user.id);
  else await syncTafFromEdital(user.id, sex);
  const [enrollments, tests, standards] = await Promise.all([
    getMilitaryEnrollments(user.id),
    tab === "taf" ? getTafTests(user.id, today) : Promise.resolve([]),
    tab === "taf" ? getTafStandards(user.id, sex) : Promise.resolve([]),
  ]);
  const anyStandards = standards.some((v) => v.standards.length > 0);
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
            <Notice tone="info" title="Preenchido com o edital">
              Quando o edital do concurso é publicado no Vértice, as datas de cada etapa e os documentos, exames e prazos entram aqui sozinhos, com o link do edital. Uma data que você
              mudar continua sua. Marque o que já cumpriu; os prazos aparecem no calendário e geram lembretes 7, 3 e 1 dia antes.
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
          {!sex && anyStandards && <TafSexChooser />}
          {standards.map((v) => (
            <TafStandardsTable key={v.enrollmentId} view={v} sexKnown={!!sex} />
          ))}
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
