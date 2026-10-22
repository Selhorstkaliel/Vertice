import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { ParagraphRewriteForm, RewriteEssayButton } from "@/components/essays/essay-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { essaysEnabled } from "@/lib/plan-limits";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber, formatTimer } from "@/lib/format";
import { cn } from "@/lib/utils";
import { lineCheck, paragraphsOf } from "@/engines/essays/correction";
import { essayQuota, parseCriteria, parseScores } from "@/modules/essays/service";
import { essayPrivacyNote } from "@/modules/essays/privacy";
import { essayAiConfigured, essayProvider } from "@/modules/ai/structured";
import { z } from "zod";

export const metadata: Metadata = { title: "Correção da redação" };

const issuesSchema = z.array(z.object({ title: z.string(), explanation: z.string(), excerpt: z.string().nullable() }));
const exerciseSchema = z.object({ index: z.number().int(), criterionKey: z.string(), instruction: z.string() }).nullable();
const feedbackSchema = z.object({ before: z.number(), after: z.number(), improved: z.boolean(), comment: z.string() });

/** Wraps verified excerpts in <mark> so the student sees what each comment refers to. */
function Highlighted({ text, excerpts }: { text: string; excerpts: string[] }) {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const e of excerpts) {
    const i = lower.indexOf(e.toLowerCase());
    if (i >= 0) ranges.push([i, i + e.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s < at) continue;
    parts.push(text.slice(at, s), <mark key={s} className="rounded-sm bg-warning/20 px-0.5 text-fg">{text.slice(s, e)}</mark>);
    at = e;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export default async function EssayResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  if (!essaysEnabled(user)) notFound();
  const { id } = await params;
  const essay = await db.essay.findFirst({
    where: { id, userId: user.id },
    include: {
      theme: { select: { title: true, origin: true, year: true } },
      rubric: { include: { competition: { select: { name: true } } } },
      corrections: { orderBy: { createdAt: "desc" }, take: 1 },
      paragraphs: { orderBy: { createdAt: "desc" } },
      original: { select: { id: true, corrections: { select: { totalMid: true }, orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  if (!essay) notFound();
  const tz = user.profile.timezone;
  const correction = essay.corrections[0] ?? null;
  const paragraphs = paragraphsOf(essay.text);
  const lines = lineCheck(essay.estimatedLines, essay.rubric.minLines, essay.rubric.maxLines);

  if (!correction) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={essay.theme?.title ?? "Redação"} description={essay.status === "SUBMITTED" ? "Em correção." : "Rascunho."} />
        <Link href={`/redacao/escrever?rascunho=${essay.id}`} className="text-info underline underline-offset-4">
          Continuar escrevendo
        </Link>
      </div>
    );
  }

  const scores = parseScores(correction.scores);
  const issues = issuesSchema.safeParse(correction.topIssues).data ?? [];
  const exercise = exerciseSchema.safeParse(correction.exercise ?? null).data ?? null;
  const criteria = parseCriteria(essay.rubric.criteria);
  const exerciseCriterion = exercise ? criteria.find((c) => c.key === exercise.criterionKey) : null;
  const quota = await essayQuota(user, tz);
  const excerpts = [...scores.map((s) => s.excerpt), ...issues.map((i) => i.excerpt)].filter((e): e is string => !!e);
  const previousMid = essay.original?.corrections[0]?.totalMid ?? null;

  return (
    <div className="flex flex-col gap-10">
      <Link href="/redacao" className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg">
        <ChevronLeft className="size-4" />
        Redação
      </Link>
      <PageHeader
        title={essay.theme?.title ?? "Tema livre"}
        description={`${essay.rubric.competition.name}, corrigida em ${formatDateTime(correction.createdAt, tz)}${essay.timeSpentSec ? `. Tempo de escrita: ${formatTimer(essay.timeSpentSec)}` : ""}.`}
        actions={<RewriteEssayButton essayId={essay.id} />}
      />

      <section aria-label="Nota estimada" className="flex flex-wrap items-end gap-x-12 gap-y-4 border-y py-6">
        <div className="flex flex-col gap-1">
          <p className="text-base text-fg-subtle">Faixa estimada</p>
          <p className="flex items-baseline gap-2">
            <span className="numeral text-[3rem] leading-none font-light text-fg">
              {formatNumber(correction.totalMin, 1)} a {formatNumber(correction.totalMax, 1)}
            </span>
            <span className="text-lg text-fg-subtle">de {formatNumber(correction.maxScore, 1)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {correction.uncertain ? <Badge tone="warning">Correção incerta</Badge> : <Badge tone="outline">Duas correções concordantes</Badge>}
          {!essay.rubric.verified && <Badge tone="warning">Critérios não verificados com o edital deste ano</Badge>}
          {essay.timed && <Badge tone="outline">Cronometrada</Badge>}
          {essay.original && <Badge tone="outline">Reescrita{previousMid !== null ? `: antes, ponto médio ${formatNumber(previousMid, 1)}` : ""}</Badge>}
        </div>
      </section>
      <p className="-mt-6 max-w-3xl text-sm text-fg-subtle">
        Estimativa feita por IA a partir de duas correções independentes, não a nota oficial da banca e sem garantia de coincidir com ela.
        {correction.uncertain && " As duas correções divergiram mais do que o normal; por isso a faixa é mais larga. Releia os comentários com espírito crítico."} {lines.message}
      </p>

      {correction.zeroFlag && (
        <Notice tone="danger" title="Risco de nota zero">
          {correction.zeroFlag}
        </Notice>
      )}

      <section aria-labelledby="issues-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="issues-title">O que mais tirou pontos</span>
        </SectionTitle>
        <ol className="flex max-w-3xl flex-col gap-3">
          {issues.map((i, n) => (
            <li key={n} className="flex flex-col gap-1">
              <span className="text-base font-medium text-fg">
                {n + 1}. {i.title}
              </span>
              <span className="text-base text-fg-muted">{i.explanation}</span>
              {i.excerpt && <span className="text-sm text-fg-subtle">Trecho: “{i.excerpt}”</span>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="criteria-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="criteria-title">Nota por critério</span>
        </SectionTitle>
        <ul className="flex flex-col border-t">
          {scores.map((s) => (
            <li key={s.key} className="flex flex-col gap-1 border-b border-line-soft py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-base font-medium text-fg">{s.name}</span>
                <span className="numeral text-base text-fg-muted">
                  {s.min === s.max ? formatNumber(s.score, 1) : `${formatNumber(s.min, 1)} a ${formatNumber(s.max, 1)}`} de {formatNumber(s.maxScore, 1)}
                </span>
              </div>
              {s.comment && <p className="text-base text-fg-muted">{s.comment}</p>}
              {s.excerpt && <p className="text-sm text-fg-subtle">Trecho: “{s.excerpt}”</p>}
            </li>
          ))}
        </ul>
      </section>

      {exercise && exerciseCriterion && paragraphs[exercise.index] && (
        <section aria-labelledby="exercise-title" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="exercise-title">Exercício de reescrita</span>
          </SectionTitle>
          <p className="max-w-3xl text-base text-fg">
            Reescreva o {exercise.index + 1}º parágrafo pensando em <strong className="font-medium">{exerciseCriterion.name}</strong>. {exercise.instruction}
          </p>
          <ParagraphRewriteForm essayId={essay.id} original={paragraphs[exercise.index]!} disabled={!essayAiConfigured()} rewritesLeft={quota.rewritesLeft} />
          {essay.paragraphs.length > 0 && (
            <ul className="flex max-w-3xl flex-col gap-3 pt-2">
              {essay.paragraphs.map((p) => {
                const f = feedbackSchema.safeParse(p.feedback).data;
                return (
                  <li key={p.id} className="flex flex-col gap-1 border-l-2 border-line pl-4">
                    <span className={cn("text-sm font-medium", f?.improved ? "text-positive" : "text-warning")}>
                      {f ? `${f.improved ? "Melhorou" : "Ainda não melhorou"}: trecho de ${formatNumber(f.before, 1)} para ${formatNumber(f.after, 1)} (de 10), estimativa` : "Avaliação indisponível"}
                    </span>
                    <span className="text-base text-fg-muted">{f?.comment}</span>
                    <details className="text-sm text-fg-subtle">
                      <summary className="cursor-pointer select-none">Sua versão</summary>
                      <p className="mt-1 whitespace-pre-line">{p.newText}</p>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="text-title" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="text-title">Seu texto</span>
        </SectionTitle>
        <div className="flex max-w-3xl flex-col gap-3 text-md leading-8 text-fg">
          {paragraphs.map((p, i) => (
            <p key={i} className={cn(exercise?.index === i && "border-l-2 border-info pl-3")}>
              <Highlighted text={p} excerpts={excerpts} />
            </p>
          ))}
        </div>
        <p className="text-sm text-fg-subtle">Os trechos destacados são os citados nos comentários. Só aparecem trechos que existem de fato no seu texto.</p>
      </section>

      <Notice tone="neutral" title="Privacidade">
        {essayPrivacyNote(essayProvider())}
      </Notice>
    </div>
  );
}
