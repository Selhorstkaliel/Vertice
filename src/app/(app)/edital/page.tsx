import type { Metadata } from "next";
import Link from "next/link";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { EditalTree } from "@/components/edital/edital-tree";
import { AddSubjectDialog, CustomizeEditalButton } from "@/components/competitions/competition-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getEnrollments } from "@/modules/competitions/queries";
import { getEditalTree } from "@/modules/syllabus/queries";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Edital" };

export default async function EditalPage({
  searchParams,
}: {
  searchParams: Promise<{ concurso?: string; topico?: string; materia?: string }>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const enrollments = await getEnrollments(user.id);

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Edital verticalizado" />
        <EmptyState
          icon={<ListTree />}
          title="Nenhum concurso na sua lista"
          description="Adicione um concurso para navegar pelo edital em disciplinas, conteúdos e subconteúdos."
          action={
            <Button asChild variant="primary">
              <Link href="/concursos">Meus concursos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // A topic or subject link without a competition opens the first competition that contains it.
  let selected = enrollments.find((e) => e.competitionId === params.concurso);
  if (!selected && (params.topico || params.materia)) {
    const match = await db.competitionTopic.findFirst({
      where: {
        competitionId: { in: enrollments.map((e) => e.competitionId) },
        ...(params.topico ? { topicId: params.topico } : { topic: { subjectId: params.materia } }),
      },
      select: { competitionId: true },
    });
    selected = enrollments.find((e) => e.competitionId === match?.competitionId);
  }
  selected ??= enrollments.find((e) => e.isPrimary) ?? enrollments[0]!;

  const tree = await getEditalTree(user.id, selected.competitionId);
  if (!tree) return <Notice tone="danger">Edital não encontrado.</Notice>;

  const catalogSubjects = tree.competition.editable
    ? await db.subject.findMany({
        where: { OR: [{ ownerId: null }, { ownerId: user.id }], id: { notIn: tree.subjects.map((s) => s.id) } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Edital verticalizado"
        description="Concurso, disciplina, conteúdo e subconteúdo, com seu progresso em cada tópico."
        actions={
          tree.competition.editable ? (
            <AddSubjectDialog competitionId={tree.competition.id} subjects={catalogSubjects} />
          ) : (
            <CustomizeEditalButton enrollmentId={selected.id} />
          )
        }
      />

      {enrollments.length > 1 && (
        <nav aria-label="Concursos" className="scrollbar-thin -mt-2 flex gap-2 overflow-x-auto">
          {enrollments.map((e) => (
            <Link
              key={e.id}
              href={`/edital?concurso=${e.competitionId}`}
              aria-current={e.id === selected.id ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-base transition-colors",
                e.id === selected.id ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
              )}
            >
              {e.competition.name}
              {e.isPrimary && <span className="sr-only"> (principal)</span>}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-6 border-y py-5">
        <div className="flex flex-col gap-1">
          <p className="text-base text-fg-subtle">{tree.competition.name}</p>
          <p className="flex items-baseline gap-2">
            <span className="numeral text-3xl font-light text-fg">{formatPercent(tree.coverage)}</span>
            <span className="text-base text-fg-muted">do edital estudado</span>
          </p>
        </div>
        {tree.competition.editable && <Badge tone="outline">Edital personalizado</Badge>}
      </div>

      {tree.competition.verification === "UNVERIFIED" && (
        <Notice tone="warning" title="Informação não verificada">
          {tree.competition.sourceNote ?? "Confirme disciplinas e conteúdos no edital oficial."} Personalize o edital para ajustá-lo ao documento oficial.
        </Notice>
      )}

      {tree.subjects.length === 0 ? (
        <EmptyState
          title="Edital sem disciplinas"
          description={tree.competition.editable ? "Adicione as disciplinas do edital oficial. As do catálogo já vêm com tópicos de referência." : "Personalize o edital para adicionar disciplinas."}
          action={tree.competition.editable ? <AddSubjectDialog competitionId={tree.competition.id} subjects={catalogSubjects} /> : <CustomizeEditalButton enrollmentId={selected.id} variant="primary" />}
        />
      ) : (
        <EditalTree competitionId={tree.competition.id} subjects={tree.subjects} editable={tree.competition.editable} tz={user.profile.timezone} nowIso={new Date().toISOString()} />
      )}
    </div>
  );
}
