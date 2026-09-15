import "server-only";
import type { DraftOrigin, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keyForQuestion, resolvePaperKey, type KeySection, type PaperSection } from "@/engines/questions/answer-key";
import { checkDraft, type DraftOption, type OfficialKeyEntry } from "@/engines/questions/draft-check";

export interface DraftFigure {
  page: number;
  box: [number, number, number, number];
  description: string;
  file: string | null;
  /** Cropped automatically and not adjusted by a person; may be re-cropped when the method improves. */
  auto?: boolean;
}

export interface StoredAnswerKey {
  kind: "DEFINITIVO" | "PRELIMINAR" | "DESCONHECIDO";
  sections: KeySection[];
}

/** Everything the pipeline learned about a draft besides its text. */
export interface DraftVerification {
  /** Extracted: numbers in the transcription not found in the PDF text layer. */
  unmatchedNumbers?: string[];
  /** Extracted: the AI's own solution, compared with the official key. */
  aiAnswer?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  model?: string;
  /** Extracted: second pass that explained the official answer after a disagreement. */
  explainedFromKey?: { answer: string | null; confidence: "HIGH" | "MEDIUM" | "LOW" };
  /** Generated: the generator's answer and an independent solve without it. */
  generatorAnswer?: string | null;
  solverAnswer?: string | null;
  solverModel?: string;
  exampleQuestionIds?: string[];
  closestExample?: { questionId: string; overlap: number } | null;
  styleNote?: string | null;
}

/** Above this share of shared distinctive words, a generated draft is too close to an official question. */
export const COPY_THRESHOLD = 0.6;

export interface EvaluatedDraft {
  origin: DraftOrigin;
  number: number | null;
  verification: Prisma.JsonValue;
  examPaper: { version: string; layout: Prisma.JsonValue; answerKey: Prisma.JsonValue } | null;
}

/** Key entries of a paper (all subjects of its version), or null when it has no key. */
export function paperKey(paper: EvaluatedDraft["examPaper"]) {
  const key = paper?.answerKey as StoredAnswerKey | null | undefined;
  if (!paper || !key) return { entries: null, note: null };
  return resolvePaperKey(paper.version, (paper.layout as PaperSection[] | null) ?? [], key.sections);
}

/**
 * The single place that decides a draft's answer and open issues, used when
 * extracting, generating, re-checking and saving. `reviewed` drops warnings
 * that only ask a person to look.
 */
export async function evaluateDraft(
  draft: EvaluatedDraft,
  content: { statement: string; options: DraftOption[]; correctLabel: string | null; subjectId: string | null; subjectHint?: string | null },
  figures: { file: string | null }[],
  reviewed: boolean,
) {
  const verification = (draft.verification as DraftVerification | null) ?? {};
  const { entries } = paperKey(draft.examPaper);
  let key: OfficialKeyEntry[] | null = entries;
  if (entries) {
    const subject = content.subjectId ? await db.subject.findUnique({ where: { id: content.subjectId }, select: { name: true, slug: true } }) : null;
    const section = ((draft.examPaper?.layout as PaperSection[] | null) ?? []).find((s) => draft.number !== null && draft.number >= s.from && draft.number <= s.to);
    key = keyForQuestion(entries, draft.number, [subject?.name, subject?.slug, section?.subject, content.subjectHint]);
  }
  const check = checkDraft(
    { number: draft.number, statement: content.statement, options: content.options, figures, proposedLabel: content.correctLabel, unmatchedNumbers: verification.unmatchedNumbers },
    key,
    { reviewed },
  );
  const issues = [...check.issues];
  if (!content.subjectId) issues.push("Escolha a disciplina.");
  if (!reviewed && check.correctLabel) {
    if (draft.origin === "EXTRACTED" && verification.aiAnswer && verification.aiAnswer !== check.correctLabel) {
      const fromKey = verification.explainedFromKey;
      issues.push(
        fromKey && fromKey.answer === check.correctLabel && fromKey.confidence !== "LOW"
          ? `A resolução independente da IA chegou em ${verification.aiAnswer}; a explicação foi refeita a partir do gabarito (${check.correctLabel}). Confira a transcrição e cada passo da resolução.`
          : `A IA não conseguiu sustentar o gabarito ${check.correctLabel} (chegou em ${fromKey?.answer ?? verification.aiAnswer}). Confira a transcrição; se a resolução estiver errada, reescreva-a.`,
      );
    }
    if (draft.origin === "GENERATED") {
      if (!verification.solverAnswer) issues.push("A verificação independente não resolveu esta questão: resolva antes de publicar.");
      else if (verification.solverAnswer !== check.correctLabel) issues.push(`A verificação independente chegou em ${verification.solverAnswer}, mas a questão indica ${check.correctLabel}.`);
      else if (verification.confidence === "LOW") issues.push("A verificação independente teve baixa confiança: confira a resolução.");
      if (verification.closestExample && verification.closestExample.overlap >= COPY_THRESHOLD) {
        issues.push(`Parecida demais com uma questão oficial de referência (${Math.round(verification.closestExample.overlap * 100)}% das palavras): reescreva ou rejeite.`);
      }
    }
  }
  return { ...check, issues };
}
