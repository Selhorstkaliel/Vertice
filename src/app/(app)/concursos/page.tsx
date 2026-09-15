import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompetitionFormDialog, EnrollButton, SetPrimaryButton } from "@/components/competitions/competition-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { describeEnrollment, getEnrollments, listCatalog, listExamBoards } from "@/modules/competitions/queries";
import { COMPETITION_KIND_LABEL, ENROLLMENT_STATUS_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { formatCalendarDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Meus concursos" };

export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const tz = user.profile.timezone;
  const kind = params.tipo === "militar" ? "MILITARY" : params.tipo === "publico" ? "PUBLIC" : "ALL";

  const [enrollments, catalog, boards] = await Promise.all([
    getEnrollments(user.id, { includeArchived: true }),
    listCatalog(user.id, { q: params.q, kind }),
    listExamBoards(),
  ]);

  // Subjects that appear in more than one active competition (shared study, §14).
  const active = enrollments.filter((e) => e.status === "ACTIVE");
  const subjectUse = new Map<string, { name: string; competitions: string[] }>();
  for (const e of active)
    for (const s of e.competition.subjects) {
      const entry = subjectUse.get(s.subjectId) ?? { name: s.subject.name, competitions: [] };
      entry.competitions.push(e.competition.name);
      subjectUse.set(s.subjectId, entry);
    }
  const shared = [...subjectUse.values()].filter((s) => s.competitions.length > 1);
  const enrolledIds = new Set(enrollments.map((e) => e.competitionId));
  const enrolledSources = new Set(enrollments.map((e) => e.competition.forkedFromId).filter(Boolean));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Meus concursos"
        description="Um concurso principal orienta o plano. Os secundários também recebem estudo, com prioridade menor."
        actions={<CompetitionFormDialog boards={boards} />}
      />

      <section aria-labelledby="mine-title" className="flex flex-col">
        <SectionTitle>
          <span id="mine-title">Na sua lista</span>
        </SectionTitle>
        {enrollments.length === 0 ? (
          <EmptyState title="Nenhum concurso" description="Adicione um concurso do catálogo abaixo ou cadastre o seu." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {enrollments.map((e) => {
              const d = describeEnrollment(e, tz);
              return (
                <li key={e.id}>
                  <Card className={cn("relative flex h-full flex-col gap-4 p-5", e.status !== "ACTIVE" && "opacity-70")}>
                    {e.isPrimary && <span aria-hidden="true" className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-performance" />}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Link href={`/concursos/${e.competitionId}`} className="truncate text-lg font-semibold tracking-[-0.015em] hover:underline hover:underline-offset-4">
                          {d.title}
                        </Link>
                        <p className="truncate text-base text-fg-muted">
                          {e.competition.organization}
                          {e.competition.position ? ` — ${e.competition.position}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge tone={e.isPrimary ? "performance" : "neutral"}>{e.isPrimary ? "Principal" : "Secundário"}</Badge>
                        {e.status !== "ACTIVE" && <Badge tone="outline">{ENROLLMENT_STATUS_LABEL[e.status]}</Badge>}
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-0.5">
                        <dd className="numeral text-lg text-fg">{d.daysLeft !== null && d.daysLeft >= 0 ? formatNumber(d.daysLeft) : "—"}</dd>
                        <dt className="text-sm text-fg-subtle">{d.examDate ? `dias — ${formatCalendarDate(d.examDate)}` : "Data não definida"}</dt>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dd className="numeral text-lg text-fg">{e.competition.subjects.length}</dd>
                        <dt className="text-sm text-fg-subtle">disciplinas</dt>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dd className="numeral text-lg text-fg">{e.competition._count.topics}</dd>
                        <dt className="text-sm text-fg-subtle">tópicos</dt>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/edital?concurso=${e.competitionId}`}>Ver edital</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/concursos/${e.competitionId}`}>Detalhes</Link>
                      </Button>
                      {!e.isPrimary && e.status === "ACTIVE" && <SetPrimaryButton enrollmentId={e.id} />}
                      {e.competition.verification === "UNVERIFIED" && <span className="ml-auto text-sm text-warning">{VERIFICATION_LABEL.UNVERIFIED}</span>}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {shared.length > 0 && (
        <section aria-labelledby="shared-title" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="shared-title">Matérias compartilhadas</span>
          </SectionTitle>
          <p className="-mt-2 max-w-2xl text-base text-fg-muted">
            Estudo em conteúdo equivalente conta para todos os concursos que o incluem. O plano não duplica esforço.
          </p>
          <ul className="flex flex-col">
            {shared.map((s) => (
              <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-2.5 last:border-b-0">
                <span className="text-base text-fg">{s.name}</span>
                <span className="text-sm text-fg-subtle">{s.competitions.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="catalog-title" className="flex flex-col gap-4">
        <SectionTitle>
          <span id="catalog-title">Catálogo</span>
        </SectionTitle>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input name="q" defaultValue={params.q} placeholder="Pesquisar concurso, órgão ou cargo" className="pl-9" aria-label="Pesquisar no catálogo" />
          </div>
          {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
          <div className="flex gap-1.5">
            {[
              { v: undefined, l: "Todos" },
              { v: "publico", l: "Públicos" },
              { v: "militar", l: "Militares" },
            ].map((o) => {
              const href = `/concursos?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(o.v ? { tipo: o.v } : {}) }).toString()}`;
              const on = params.tipo === o.v;
              return (
                <Link
                  key={o.l}
                  href={href}
                  aria-current={on ? "true" : undefined}
                  className={cn("rounded-full px-3 py-1.5 text-sm", on ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg")}
                >
                  {o.l}
                </Link>
              );
            })}
          </div>
        </form>
        <p className="text-sm text-fg-subtle">
          Estruturas do catálogo são referências não verificadas: não incluem pesos, datas ou banca. Confirme tudo no edital oficial.
        </p>
        {catalog.length === 0 ? (
          <p className="py-6 text-base text-fg-muted">Nenhum concurso encontrado. Cadastre o seu com os dados do edital.</p>
        ) : (
          <ul className="flex flex-col">
            {catalog.map((c) => {
              const inList = enrolledIds.has(c.id) || enrolledSources.has(c.id);
              return (
                <li key={c.id} className="flex flex-col gap-2 border-b border-line-soft py-3.5 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/concursos/${c.id}`} className="truncate text-base font-medium text-fg hover:underline hover:underline-offset-4">
                        {c.name}
                      </Link>
                      <Badge tone="outline">{COMPETITION_KIND_LABEL[c.kind]}</Badge>
                      {c.ownerId && <Badge tone="outline">Seu</Badge>}
                    </div>
                    <p className="truncate text-sm text-fg-subtle">
                      {c.organization}
                      {c.position ? ` — ${c.position}` : ""}. {c.subjects.length ? c.subjects.map((s) => s.subject.name).join(", ") : "Sem disciplinas"}
                    </p>
                  </div>
                  {inList ? (
                    <span className="text-sm text-fg-subtle">Na sua lista</span>
                  ) : (
                    <EnrollButton competitionId={c.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
