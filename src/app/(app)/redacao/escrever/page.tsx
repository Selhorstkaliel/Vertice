import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge, Notice, PageHeader } from "@/components/ui/display";
import { EssayEditor } from "@/components/essays/essay-editor";
import { SupportTexts } from "@/components/essays/support-texts";
import { requireOnboardedUser } from "@/modules/auth/session";
import { essaysEnabled } from "@/lib/plan-limits";
import { db } from "@/lib/db";
import { claudeConfigured } from "@/modules/ai/claude";
import { essayEnrollments, essayQuota, parseSupportTexts } from "@/modules/essays/service";
import { ESSAY_PRIVACY_NOTE } from "@/modules/essays/privacy";

export const metadata: Metadata = { title: "Escrever redação" };

export default async function WriteEssayPage({ searchParams }: { searchParams: Promise<{ rascunho?: string; tema?: string; cronometrada?: string }> }) {
  const user = await requireOnboardedUser();
  if (!essaysEnabled(user)) notFound();
  const sp = await searchParams;
  const enrollments = await essayEnrollments(user.id);
  const primary = enrollments[0];
  if (!primary) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Escrever redação" />
        <Notice tone="warning">Nenhum concurso da sua lista tem critérios de redação publicados ainda.</Notice>
      </div>
    );
  }

  const draft = sp.rascunho
    ? await db.essay.findFirst({ where: { id: sp.rascunho, userId: user.id }, include: { theme: true, rubric: { select: { competitionId: true, charsPerLine: true, minLines: true, maxLines: true } } } })
    : null;
  if (sp.rascunho && !draft) notFound();
  if (draft && draft.status !== "DRAFT") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Redação enviada" />
        <Link href={`/redacao/${draft.id}`} className="text-info underline underline-offset-4">
          Ver correção
        </Link>
      </div>
    );
  }
  const theme = draft?.theme ?? (sp.tema ? await db.essayTheme.findFirst({ where: { id: sp.tema, status: "PUBLISHED" } }) : null);
  const enrollment = enrollments.find((e) => e.sourceCompetitionId === (draft?.rubric.competitionId ?? theme?.competitionId)) ?? primary;
  const rubric = draft?.rubric ?? enrollment.rubric;
  const quota = await essayQuota(user, user.profile.timezone);
  const timed = draft ? draft.timed : sp.cronometrada === "1";

  return (
    <div className="flex flex-col gap-8">
      <Link href="/redacao" className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg">
        <ChevronLeft className="size-4" />
        Redação
      </Link>
      <PageHeader
        title={theme ? theme.title : "Tema livre"}
        description={`${enrollment.competition.name}: ${enrollment.rubric.textType}${enrollment.rubric.maxLines ? `, até ${enrollment.rubric.maxLines} linhas` : ""}.`}
      />
      {theme && (
        <section aria-label="Proposta" className="-mt-4 flex max-w-3xl flex-col gap-4">
          <Badge tone={theme.origin === "OFFICIAL" ? "outline" : "info"} className="self-start">
            {theme.origin === "OFFICIAL" ? `Tema oficial${theme.year ? ` (${theme.year})` : ""}` : "Tema gerado por IA"}
          </Badge>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">{theme.prompt}</p>
          <SupportTexts texts={parseSupportTexts(theme.supportTexts)} />
        </section>
      )}
      {timed && (
        <Notice tone="info" title="Redação cronometrada">
          Escreva de uma vez, sem consultas, como no dia da prova. Confira no edital o tempo total da prova e quanto dele você pretende reservar para a redação.
        </Notice>
      )}
      {!enrollment.rubric.verified && <Notice tone="warning">Critérios não verificados com o edital deste ano.</Notice>}
      <EssayEditor
        draftId={draft?.id ?? null}
        competitionId={enrollment.competitionId}
        themeId={theme?.id ?? null}
        originalId={draft?.originalId ?? null}
        initialText={draft?.text ?? ""}
        initialSeconds={draft?.timeSpentSec ?? 0}
        timed={timed}
        rubric={{ charsPerLine: rubric.charsPerLine, minLines: rubric.minLines, maxLines: rubric.maxLines }}
        correctionsLeft={quota.correctionsLeft}
        aiReady={claudeConfigured()}
        privacyNote={ESSAY_PRIVACY_NOTE}
      />
    </div>
  );
}
