import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { SimulationForm } from "@/components/simulations/simulation-form";
import { requireOnboardedUser } from "@/modules/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Novo simulado" };

export default async function NewSimulationPage() {
  const user = await requireOnboardedUser();
  const visible = { OR: [{ ownerId: null }, { ownerId: user.id }] };
  const [enrollments, boards, counts, subjects] = await Promise.all([
    db.studentCompetition.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { isPrimary: true, competition: { select: { id: true, name: true, subjects: { select: { subjectId: true } } } } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
    db.examBoard.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.question.groupBy({ by: ["subjectId"], where: visible, _count: { _all: true } }),
    db.subject.findMany({ where: visible, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.subjectId, c._count._all]));
  const primary = enrollments.find((e) => e.isPrimary);

  return (
    <div className="flex flex-col">
      <PageHeader title="Novo simulado" description="Escolha o recorte. As questões são sorteadas no momento em que o simulado começa." />
      <SimulationForm
        competitions={enrollments.map((e) => ({ id: e.competition.id, name: e.competition.name, subjectIds: e.competition.subjects.map((s) => s.subjectId) }))}
        boards={boards}
        subjects={subjects.map((s) => ({ ...s, available: countBy.get(s.id) ?? 0 })).sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || a.name.localeCompare(b.name, "pt-BR"))}
        defaults={{ competitionId: primary?.competition.id ?? null }}
      />
    </div>
  );
}
