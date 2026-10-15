import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, PageHeader, SectionTitle } from "@/components/ui/display";
import { ScoringRuleForm } from "@/components/admin/scoring-rule-form";
import { requireAdmin } from "@/modules/auth/admin";
import { listRules } from "@/modules/scoring/service";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/format";
import { VERIFICATION_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Regras de pontuação" };

export default async function ScoringRulesPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await requireAdmin();
  const { editar } = await searchParams;
  const [rules, competitions] = await Promise.all([
    listRules(),
    db.competition.findMany({
      where: { ownerId: null, forkedFromId: null },
      select: { id: true, name: true, subjects: { select: { questionCount: true, subject: { select: { id: true, name: true } } }, orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const editing = editar ? rules.find((r) => r.id === editar) : undefined;
  const options = competitions.map((c) => ({ id: c.id, name: c.name, subjects: c.subjects.map((s) => ({ id: s.subject.id, name: s.subject.name, questionCount: s.questionCount })) }));

  return (
    <div className="flex flex-col gap-10">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Regras de pontuação"
        description="Como cada concurso pontua a prova objetiva: desconto por erro, pesos, mínimos, tempo e nota de corte. Cadastre sempre com a fonte; sem conferência no edital, o aluno vê “Informação não verificada”."
      />

      <section aria-labelledby="rules-list" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="rules-list">Regras cadastradas</span>
        </SectionTitle>
        {rules.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhuma regra. Sem regra, o simulado mostra só acertos, sem desconto nem pesos.</p>
        ) : (
          <ul className="flex flex-col border-t">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base text-fg">
                    {r.competition.name} {r.year ?? "(ano não informado)"}
                  </span>
                  <span className="text-sm text-fg-subtle">
                    {r.mode === "PENALTY" ? `Cada erro anula ${r.wrongPenalty} acerto(s)` : "Acertos, sem desconto"}
                    {r.durationMinutes ? `, ${r.durationMinutes} min` : ""}
                    {r.cutoffScore !== null && r.maxScore ? `, corte ${r.cutoffScore} de ${r.maxScore}` : ""}
                    {r.minTotalShare !== null ? `, mínimo ${formatPercent(r.minTotalShare)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={r.verification === "VERIFIED" ? "positive" : "warning"}>{VERIFICATION_LABEL[r.verification]}</Badge>
                  <Link href={`/admin/regras?editar=${r.id}`} className="text-sm text-info hover:underline hover:underline-offset-4">
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rule-form" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="rule-form">{editing ? `Editar: ${editing.competition.name} ${editing.year ?? ""}` : "Nova regra"}</span>
        </SectionTitle>
        <ScoringRuleForm
          key={editing?.id ?? "new"}
          competitions={options}
          initial={
            editing
              ? {
                  id: editing.id,
                  competitionId: editing.competitionId,
                  year: editing.year,
                  mode: editing.mode,
                  wrongPenalty: editing.wrongPenalty,
                  durationMinutes: editing.durationMinutes,
                  subjects: editing.subjects,
                  minTotalShare: editing.minTotalShare,
                  cutoffScore: editing.cutoffScore,
                  maxScore: editing.maxScore,
                  sourceUrl: editing.sourceUrl,
                  sourceNote: editing.sourceNote,
                  verified: editing.verification === "VERIFIED",
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
