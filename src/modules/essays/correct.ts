import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { combineRuns, estimateLines, paragraphsOf, type CorrectionRun, type RubricCriterion } from "@/engines/essays/correction";
import { structuredCall } from "@/modules/ai/claude";
import {
  CORRECTION_INSTRUCTIONS,
  REWRITE_INSTRUCTIONS,
  REWRITE_JSON_SCHEMA,
  correctionJsonSchema,
  correctionSchema,
  correctionUserMessage,
  rewriteSchema,
  rewriteUserMessage,
  rubricBlock,
} from "./prompts";
import { parseCriteria } from "./service";

/** Output budget for one correction: JSON of a few thousand characters plus adaptive thinking. */
const CORRECTION_MAX_TOKENS = 8000;
const REWRITE_MAX_TOKENS = 2500;

export interface CorrectionRequest {
  userId: string | null;
  essayId: string | null;
  model: string;
  rubric: { competitionName: string; year: number | null; textType: string; minLines: number | null; maxLines: number | null; charsPerLine: number; criteria: RubricCriterion[]; zeroingRules: string[] };
  theme: { title: string; prompt: string } | null;
  text: string;
}

/**
 * Two independent corrections (separate requests, no shared history), each
 * validated against the rubric, combined into a range. Used by the app and by
 * the calibration script.
 */
export async function runCorrection(req: CorrectionRequest) {
  const lines = estimateLines(req.text, req.rubric.charsPerLine);
  const call = () =>
    structuredCall({
      feature: "ESSAY_CORRECTION",
      userId: req.userId,
      refId: req.essayId,
      model: req.model,
      effort: env.ESSAY_EFFORT,
      maxTokens: CORRECTION_MAX_TOKENS,
      system: [CORRECTION_INSTRUCTIONS, rubricBlock(req.rubric)],
      user: correctionUserMessage(req.theme, req.text, lines),
      jsonSchema: correctionJsonSchema(req.rubric.criteria.map((c) => c.key)),
      schema: correctionSchema(req.rubric.criteria),
    });
  const [a, b] = await Promise.all([call(), call()]);
  const combined = combineRuns(req.rubric.criteria, [a.data as CorrectionRun, b.data as CorrectionRun], req.text, {
    margin: env.ESSAY_RANGE_MARGIN,
    threshold: env.ESSAY_DISAGREEMENT_THRESHOLD,
    paragraphCount: paragraphsOf(req.text).length,
  });
  return { combined, runs: [a.data, b.data], model: a.model, usage: [a.usage, b.usage], lines };
}

/** Corrects a submitted essay and stores the result. The quota only counts stored corrections. */
export async function correctEssay(userId: string, essayId: string) {
  const essay = await db.essay.findFirst({
    where: { id: essayId, userId },
    include: { rubric: { include: { competition: { select: { name: true } } } }, theme: { select: { title: true, prompt: true } } },
  });
  if (!essay) return null;
  const rubric = essay.rubric;
  const result = await runCorrection({
    userId,
    essayId,
    model: env.ESSAY_MODEL,
    rubric: { ...rubric, competitionName: rubric.competition.name, criteria: parseCriteria(rubric.criteria) },
    theme: essay.theme,
    text: essay.text,
  });
  const c = result.combined;
  const correction = await db.$transaction(async (tx) => {
    const created = await tx.essayCorrection.create({
      data: {
        essayId,
        model: result.model,
        scores: c.scores as unknown as Prisma.InputJsonValue,
        topIssues: c.topIssues as unknown as Prisma.InputJsonValue,
        exercise: (c.exercise ?? undefined) as Prisma.InputJsonValue | undefined,
        runs: result.runs as unknown as Prisma.InputJsonValue,
        totalMin: c.totalMin,
        totalMax: c.totalMax,
        totalMid: c.totalMid,
        maxScore: c.maxScore,
        disagreement: c.disagreement,
        uncertain: c.uncertain,
        zeroFlag: c.zeroFlag,
      },
      select: { id: true },
    });
    await tx.essay.update({ where: { id: essayId }, data: { status: "CORRECTED", correctedAt: new Date() } });
    return created;
  });
  return correction.id;
}

/** Re-corrects only the rewritten paragraph, on the criterion of the exercise. */
export async function correctParagraphRewrite(input: {
  userId: string;
  essayId: string;
  themeTitle: string | null;
  criterion: RubricCriterion;
  instruction: string;
  original: string;
  rewrite: string;
}) {
  return structuredCall({
    feature: "ESSAY_REWRITE",
    userId: input.userId,
    refId: input.essayId,
    model: env.ESSAY_REWRITE_MODEL,
    effort: "low",
    maxTokens: REWRITE_MAX_TOKENS,
    system: [REWRITE_INSTRUCTIONS],
    user: rewriteUserMessage({ themeTitle: input.themeTitle, criterion: input.criterion, instruction: input.instruction, original: input.original, rewrite: input.rewrite }),
    jsonSchema: REWRITE_JSON_SCHEMA,
    schema: rewriteSchema,
  });
}
