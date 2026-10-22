import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { AddEssaysToPlanButton, DeleteDraftButton } from "@/components/essays/essay-controls";
import { SupportTexts } from "@/components/essays/support-texts";
import { requireOnboardedUser } from "@/modules/auth/session";
import { essaysEnabled } from "@/lib/plan-limits";
import { localNow, startOfWeek } from "@/lib/time";
import { formatDateShort, formatNumber, formatPercent } from "@/lib/format";
import { ESSAY_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { cadenceFor, essayEnrollments, essayHistory, essayQuota, themeOfTheWeek } from "@/modules/essays/service";
import { essayPrivacyNote } from "@/modules/essays/privacy";
import { essayProvider } from "@/modules/ai/structured";

export const metadata: Metadata = { title: "Redação" };

export default async function EssaysPage() {
  const user = await requireOnboardedUser();
  if (!essaysEnabled(user)) notFound();
  const tz = user.profile.timezone;
  const enrollments = await essayEnrollments(user.id);
  const primary = enrollments[0];

  if (!primary) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Redação" />
        <EmptyState
          icon={<PenLine />}
          title="Correção ainda indisponível para os seus concursos"
          description="A correção só é oferecida quando os critérios de redação do concurso estão cadastrados e revisados. Começamos pela EsPCEx; outros concursos entram aos poucos."
        />
      </div>
    );
  }

  const weekStart = startOfWeek(localNow(tz).key);
  const [cadence, theme, quota, history] = await Promise.all([
    cadenceFor(user, primary),
    themeOfTheWeek(user.id, primary.sourceCompetitionId, weekStart),
    essayQuota(user, tz),
    essayHistory(user.id),
  ]);
  const drafts = history.essays.filter((e) => e.status === "DRAFT");
  const done = history.essays.filter((e) => e.status !== "DRAFT");
  const timedNext = cadence.timed > 0 && !done.some((e) => e.timed && e.submittedAt && e.submittedAt >= new Date(Date.now() - 7 * 86_400_000));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Redação"
        description={`${primary.competition.name}: ${primary.rubric.textType}. Correção por IA com faixa estimada, nunca nota oficial.`}
        actions={
          <Button asChild variant="primary">
            <Link href={`/redacao/escrever${theme ? `?tema=${theme.id}` : ""}${timedNext ? `${theme ? "&" : "?"}cronometrada=1` : ""}`}>
              {timedNext ? "Escrever cronometrada" : "Escrever redação"}
            </Link>
          </Button>
        }
      />

      {!primary.rubric.verified && <Notice tone="warning">Critérios não verificados com o edital deste ano.</Notice>}

      <section aria-labelledby="cadence-title" className="flex flex-col gap-3">
        <SectionTitle action={cadence.remainingThisWeek > 0 ? <AddEssaysToPlanButton /> : undefined}>
          <span id="cadence-title">Sua cadência</span>
        </SectionTitle>
        <p className="text-base text-fg">
          {cadence.perWeek === 0 ? "Nenhuma redação prevista nesta semana." : `${cadence.perWeek} ${cadence.perWeek === 1 ? "redação" : "redações"} por semana${cadence.timed ? `, ${cadence.timed} cronometrada` : ""}.`}{" "}
          {cadence.remainingThisWeek > 0 ? `${cadence.remainingThisWeek === 1 ? "Falta 1" : `Faltam ${cadence.remainingThisWeek}`} nesta semana.` : cadence.perWeek > 0 ? "Semana em dia." : ""}
        </p>
        <p className="text-sm text-fg-subtle">{cadence.reason} A frequência é uma referência que sobe conforme a prova se aproxima, não uma regra da banca.</p>
        {cadence.reducedBecause && <Notice tone="warning">{cadence.reducedBecause}</Notice>}
        <p className="text-sm text-fg-subtle">
          Correções neste mês: {quota.corrections} de {quota.correctionsLimit}. Reescritas de parágrafo: {quota.rewrites} de {quota.rewritesLimit}.
        </p>
      </section>

      <section aria-labelledby="theme-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="theme-title">Tema da semana</span>
        </SectionTitle>
        {theme ? (
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-md font-semibold">{theme.title}</h3>
              <Badge tone={theme.origin === "OFFICIAL" ? "outline" : "info"}>{theme.origin === "OFFICIAL" ? `Tema oficial${theme.year ? ` (${theme.year})` : ""}` : "Tema gerado por IA"}</Badge>
            </div>
            <p className="whitespace-pre-line text-base text-fg-muted">{theme.prompt}</p>
            <details>
              <summary className="cursor-pointer text-sm text-fg-subtle select-none hover:text-fg">Textos de apoio ({theme.supportTexts.length})</summary>
              <div className="mt-3">
                <SupportTexts texts={theme.supportTexts} />
              </div>
            </details>
          </div>
        ) : (
          <p className="text-base text-fg-muted">Ainda não há tema publicado que você não tenha feito. Você pode escrever com tema livre.</p>
        )}
      </section>

      {drafts.length > 0 && (
        <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="drafts-title">Rascunhos</span>
          </SectionTitle>
          <ul className="flex flex-col border-t">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
                <Link href={`/redacao/escrever?rascunho=${d.id}`} className="text-base text-fg hover:underline hover:underline-offset-4">
                  {d.theme?.title ?? "Tema livre"}
                </Link>
                <span className="flex items-center gap-3 text-sm text-fg-subtle">
                  {formatDateShort(d.createdAt, tz)}
                  <DeleteDraftButton id={d.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="history-title">Histórico</span>
        </SectionTitle>
        {done.length === 0 ? (
          <p className="text-base text-fg-muted">Suas redações corrigidas aparecem aqui, com a faixa estimada de cada uma.</p>
        ) : (
          <ul className="flex flex-col border-t">
            {done.map((e) => {
              const c = e.corrections[0];
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-2.5">
                  <Link href={`/redacao/${e.id}`} className="flex min-w-0 flex-col hover:[&>span:first-child]:underline">
                    <span className="truncate text-base text-fg underline-offset-4">{e.theme?.title ?? "Tema livre"}</span>
                    <span className="text-sm text-fg-subtle">
                      {e.submittedAt ? formatDateShort(e.submittedAt, tz) : ""}
                      {e.originalId ? ", reescrita" : ""}
                      {e.timed ? ", cronometrada" : ""}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    {c?.uncertain && <Badge tone="warning">Incerta</Badge>}
                    <span className="numeral text-base text-fg-muted">
                      {c ? `${formatNumber(c.totalMin, 1)} a ${formatNumber(c.totalMax, 1)} de ${formatNumber(c.maxScore, 1)}` : ESSAY_STATUS_LABEL[e.status]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="evolution-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="evolution-title">Evolução por critério</span>
        </SectionTitle>
        {history.trends.length === 0 ? (
          <p className="text-base text-fg-muted">A evolução aparece a partir da segunda redação corrigida.</p>
        ) : (
          <>
            <p className="text-sm text-fg-subtle">
              Média das primeiras redações contra a das mais recentes ({history.corrected.length} corrigidas), em percentual da nota máxima de cada critério. Com poucas redações, a
              diferença pode ser só variação da correção.
            </p>
            <ul className="flex max-w-3xl flex-col gap-2">
              {history.trends.map((t) => (
                <li key={t.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4">
                  <span className="text-base text-fg">{t.name}</span>
                  <span className="numeral text-sm text-fg-subtle">
                    {formatPercent(t.from)} → {formatPercent(t.to)}
                  </span>
                  <span className={cn("numeral w-16 text-right text-sm", (t.delta ?? 0) > 0.02 ? "text-positive" : (t.delta ?? 0) < -0.02 ? "text-danger" : "text-fg-subtle")}>
                    {(t.delta ?? 0) > 0 ? "+" : ""}
                    {Math.round((t.delta ?? 0) * 100)} p.p.
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Notice tone="neutral" title="Privacidade">
        {essayPrivacyNote(essayProvider())}
      </Notice>
    </div>
  );
}
