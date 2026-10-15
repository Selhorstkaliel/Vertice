import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import {
  CompetitionFormDialog,
  CustomizeEditalButton,
  EnrollButton,
  EnrollmentSettings,
  RemoveEnrollmentButton,
  SetPrimaryButton,
  StagesEditor,
} from "@/components/competitions/competition-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { competitionTitle, getCompetitionForUser, listExamBoards } from "@/modules/competitions/queries";
import { COMPETITION_KIND_LABEL, COMPETITION_STATUS_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { formatCalendarDate, formatPercent } from "@/lib/format";
import { db } from "@/lib/db";
import { describeIncidence } from "@/engines/study/incidence";
import { getOfficialIncidence, incidenceBasis } from "@/modules/competitions/incidence";
import { syncStageItems } from "@/modules/military/stages";
import { stageItemView } from "@/modules/military/service";
import { localNow } from "@/lib/time";
import { UseOfficialDateButton } from "@/components/competitions/official-date";
import { dbDateToKey } from "@/lib/time";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const c = await getCompetitionForUser(user.id, id);
  return { title: c?.name ?? "Concurso" };
}

export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  await syncStageItems(user.id);
  const c = await getCompetitionForUser(user.id, id);
  if (!c) notFound();
  const enrollment = c.enrollments[0] ?? null;
  const owned = c.ownerId === user.id;
  const boards = owned ? await listExamBoards() : [];
  const examDate = c.examDate ?? enrollment?.customExamDate ?? null;
  const official = (await getOfficialIncidence([c.id])).get(c.id) ?? null;
  const topIncidence = official
    ? [...official.byTopic.values()].filter((t) => t.questions > 0).sort((a, b) => b.questions - a.questions || b.papers - a.papers).slice(0, 12)
    : [];
  const topicNames = topIncidence.length
    ? new Map(
        (await db.topic.findMany({ where: { id: { in: topIncidence.map((t) => t.topicId) } }, select: { id: true, name: true, subject: { select: { name: true } } } })).map((t) => [
          t.id,
          t,
        ]),
      )
    : new Map();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={competitionTitle(c, examDate)}
        description={`${c.organization}${c.position ? ` — ${c.position}` : ""}`}
        actions={
          enrollment ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`/edital?concurso=${c.id}`}>Ver edital</Link>
              </Button>
              {!enrollment.isPrimary && <SetPrimaryButton enrollmentId={enrollment.id} />}
            </>
          ) : (
            <>
              <EnrollButton competitionId={c.id} primary label="Adicionar como principal" />
              <EnrollButton competitionId={c.id} label="Adicionar como secundário" />
            </>
          )
        }
      />

      <div className="flex flex-wrap gap-2 -mt-4">
        <Badge tone="outline">{COMPETITION_KIND_LABEL[c.kind]}</Badge>
        <Badge tone="outline">{COMPETITION_STATUS_LABEL[c.status]}</Badge>
        <Badge tone={c.verification === "UNVERIFIED" ? "warning" : "outline"}>{VERIFICATION_LABEL[c.verification]}</Badge>
        {enrollment?.isPrimary && <Badge tone="performance">Principal</Badge>}
        {c.forkedFrom && <Badge tone="outline">Personalizado a partir de {c.forkedFrom.name}</Badge>}
      </div>

      {enrollment?.keepCustomExamDate && c.examDate && enrollment.customExamDate && (
        <Notice tone="info" title="Data oficial da prova publicada" action={<UseOfficialDateButton competitionId={c.id} />}>
          O edital marca a prova para {formatCalendarDate(c.examDate)}. Você informou {formatCalendarDate(enrollment.customExamDate)}, e essa data continua valendo no seu plano até você
          escolher a oficial.
        </Notice>
      )}

      {c.verification === "UNVERIFIED" && (
        <Notice tone="warning" title="Informação não verificada">
          {c.sourceNote}
        </Notice>
      )}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="info-title" className="flex flex-col gap-4">
          <SectionTitle action={owned ? (
            <CompetitionFormDialog
              boards={boards}
              competitionId={c.id}
              initial={{
                name: c.name,
                organization: c.organization,
                position: c.position ?? "",
                kind: c.kind,
                examBoardId: c.examBoardId ?? "",
                year: c.year,
                examDate: c.examDate ? dbDateToKey(c.examDate) : null,
                editalUrl: c.editalUrl ?? "",
                status: c.status,
              }}
              trigger={<Button size="sm" variant="ghost">Editar dados</Button>}
            />
          ) : undefined}>
            <span id="info-title">Dados do concurso</span>
          </SectionTitle>
          <dl className="flex flex-col">
            {[
              ["Órgão", c.organization],
              ["Cargo", c.position ?? "Não informado"],
              ["Banca", c.examBoard?.name ?? "Não informada"],
              ["Ano", c.year ? String(c.year) : "Não informado"],
              ["Data oficial da prova", c.examDate ? formatCalendarDate(c.examDate) : "Não informada"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line-soft py-2.5">
                <dt className="text-base text-fg-subtle">{k}</dt>
                <dd className="text-right text-base text-fg">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-base text-fg-subtle">Edital</dt>
              <dd className="text-right text-base">
                {c.editalUrl ? (
                  <a href={c.editalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">
                    Abrir edital
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-fg">Não informado</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="subjects-title" className="flex flex-col gap-4">
          <SectionTitle action={enrollment && !owned ? <CustomizeEditalButton enrollmentId={enrollment.id} variant="outline" /> : undefined}>
            <span id="subjects-title">Disciplinas e pesos</span>
          </SectionTitle>
          {c.subjects.length === 0 ? (
            <p className="text-base text-fg-muted">Nenhuma disciplina cadastrada.</p>
          ) : (
            <table className="w-full text-left">
              <caption className="sr-only">Disciplinas do edital</caption>
              <thead>
                <tr className="text-sm text-fg-subtle">
                  <th className="pb-2 font-normal">Disciplina</th>
                  <th className="pb-2 text-right font-normal">Peso</th>
                  <th className="pb-2 text-right font-normal">Questões</th>
                </tr>
              </thead>
              <tbody>
                {c.subjects.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="py-2.5 text-base text-fg">{s.subject.name}</td>
                    <td className="numeral py-2.5 text-right text-base text-fg-muted">{s.weight ?? "—"}</td>
                    <td className="numeral py-2.5 text-right text-base text-fg-muted">{s.questionCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.subjects.some((s) => s.weight === null) && (
            <p className="text-sm text-fg-subtle">Pesos não informados: o plano considera todas as disciplinas com o mesmo peso.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="incidence-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="incidence-title">O que mais cai</span>
        </SectionTitle>
        {official && official.papers > 0 ? (
          <>
            <p className="-mt-2 max-w-2xl text-base text-fg-muted">
              {incidenceBasis(official)}, {official.questions} questões. Só questões de provas oficiais entram na conta; as geradas por IA ficam de fora. Com poucas provas, a
              incidência é puxada para a média para não supervalorizar um tópico que caiu uma vez.
            </p>
            {topIncidence.length === 0 ? (
              <p className="text-base text-fg-muted">As questões oficiais ainda não estão classificadas por tópico.</p>
            ) : (
              <table className="w-full max-w-3xl text-left">
                <caption className="sr-only">Tópicos com mais questões nas provas oficiais</caption>
                <thead>
                  <tr className="text-sm text-fg-subtle">
                    <th className="pb-2 font-normal">Tópico</th>
                    <th className="pb-2 font-normal">Nas provas</th>
                    <th className="pb-2 text-right font-normal">Fatia</th>
                  </tr>
                </thead>
                <tbody>
                  {topIncidence.map((t) => {
                    const topic = topicNames.get(t.topicId);
                    return (
                      <tr key={t.topicId} className="border-t border-line-soft">
                        <td className="py-2.5 pr-4 text-base text-fg">
                          {topic?.name ?? "—"}
                          <span className="block text-sm text-fg-subtle">{topic?.subject.name}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-sm text-fg-muted">{describeIncidence(t)}</td>
                        <td className="numeral py-2.5 text-right text-base text-fg-muted">{formatPercent(t.share, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="max-w-2xl text-base text-fg-muted">Ainda não há provas oficiais deste concurso no banco de questões. Sem elas, a incidência fica neutra no plano.</p>
        )}
      </section>

      {enrollment && (
        <>
          <section aria-labelledby="enroll-title" className="flex max-w-2xl flex-col gap-4">
            <SectionTitle>
              <span id="enroll-title">Sua preparação</span>
            </SectionTitle>
            <EnrollmentSettings
              enrollmentId={enrollment.id}
              officialDate={c.examDate ? dbDateToKey(c.examDate) : null}
              customExamDate={enrollment.customExamDate ? dbDateToKey(enrollment.customExamDate) : null}
              status={enrollment.status}
              notes={enrollment.notes}
            />
          </section>

          <section aria-labelledby="stages-title" className="flex flex-col gap-4">
            <SectionTitle>
              <span id="stages-title">Etapas</span>
            </SectionTitle>
            <p className="-mt-2 max-w-2xl text-base text-fg-muted">
              Etapas de referência — ajuste conforme o edital. {c.kind === "MILITARY" && "Acompanhe TAF e demais etapas em Militar / TAF."}
            </p>
            <StagesEditor
              enrollmentId={enrollment.id}
              stages={enrollment.stages.map((s) => ({ id: s.id, name: s.name, status: s.status, date: s.date ? dbDateToKey(s.date) : null, notes: s.notes, items: s.items.map(stageItemView) }))}
              today={localNow(user.profile.timezone).key}
            />
          </section>

          <div className="border-t pt-6">
            <RemoveEnrollmentButton enrollmentId={enrollment.id} name={c.name} />
          </div>
        </>
      )}
    </div>
  );
}
