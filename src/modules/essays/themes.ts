import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { buildStructuredParams, getClaudeClient, parseStructured, structuredCall } from "@/modules/ai/claude";
import { recordAiUsage } from "@/modules/ai/usage";
import { THEME_INSTRUCTIONS, THEME_JSON_SCHEMA, themeReviewWarnings, themesSchema, themeUserMessage } from "./prompts";

const THEME_MAX_TOKENS = 12000;
export const GENERATED_SOURCE = "Texto gerado por IA para treino. Não é citação de autor ou veículo real.";

async function themeRequestFor(competitionId: string, count: number) {
  const [competition, rubric, themes] = await Promise.all([
    db.competition.findUnique({ where: { id: competitionId }, select: { name: true } }),
    db.essayRubric.findFirst({ where: { competitionId, publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, select: { textType: true } }),
    db.essayTheme.findMany({ where: { competitionId, status: { not: "REJECTED" } }, select: { title: true, prompt: true, year: true, origin: true } }),
  ]);
  if (!competition || !rubric) return null;
  return {
    feature: "ESSAY_THEME" as const,
    userId: null,
    refId: competitionId,
    model: env.ESSAY_THEME_MODEL,
    effort: "medium" as const,
    maxTokens: THEME_MAX_TOKENS,
    system: [THEME_INSTRUCTIONS],
    user: themeUserMessage({
      competitionName: competition.name,
      textType: rubric.textType,
      officialThemes: themes.filter((t) => t.origin === "OFFICIAL").slice(0, 8),
      existingTitles: themes.map((t) => t.title),
      count,
    }),
    jsonSchema: THEME_JSON_SCHEMA,
    schema: themesSchema,
  };
}

/** Saves generated themes as drafts; nothing reaches students before an admin publishes it. */
async function saveDrafts(competitionId: string, model: string, data: { themes: { title: string; prompt: string; supportTexts: { title: string; text: string }[] }[] }) {
  const rows = data.themes.map((t) => {
    const warnings = themeReviewWarnings(t);
    return {
      competitionId,
      title: t.title.trim(),
      prompt: t.prompt.trim(),
      supportTexts: t.supportTexts.map((s) => ({ title: s.title.trim(), text: s.text.trim(), source: GENERATED_SOURCE, generated: true })) as Prisma.InputJsonValue,
      origin: "GENERATED" as const,
      status: "DRAFT" as const,
      aiModel: model,
      reviewNote: warnings.length ? warnings.join(" ") : null,
    };
  });
  const { count } = await db.essayTheme.createMany({ data: rows });
  return count;
}

/** One competition, now (standard price). */
export async function generateThemesNow(competitionId: string, count: number) {
  const request = await themeRequestFor(competitionId, count);
  if (!request) return { created: 0, reason: "Este concurso não tem rubrica publicada." };
  const result = await structuredCall(request);
  return { created: await saveDrafts(competitionId, result.model, result.data), reason: null };
}

/**
 * Every competition with a published rubric, through the Batch API (half
 * price, results within hours). Collected later by `collectThemeBatch`.
 */
export async function submitThemeBatch(adminId: string, count: number) {
  const anthropic = getClaudeClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const competitions = await db.essayRubric.findMany({ where: { publishedAt: { not: null } }, select: { competitionId: true }, distinct: ["competitionId"] });
  const requests: { custom_id: string; params: Anthropic.Messages.MessageCreateParamsNonStreaming }[] = [];
  const map: Record<string, string> = {};
  for (const [i, c] of competitions.entries()) {
    const req = await themeRequestFor(c.competitionId, count);
    if (!req) continue;
    // The Batch API rejects the fallback parameter: build without it.
    const { betas: _betas, fallbacks: _fallbacks, ...params } = buildStructuredParams(req, false) as ReturnType<typeof buildStructuredParams> & { betas?: unknown; fallbacks?: unknown };
    const id = `tema-${i}`;
    map[id] = c.competitionId;
    requests.push({ custom_id: id, params: params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming });
  }
  if (requests.length === 0) return null;
  const batch = await anthropic.messages.batches.create({ requests });
  await db.essayThemeBatch.create({ data: { batchId: batch.id, status: batch.processing_status, requests: map, model: env.ESSAY_THEME_MODEL, createdById: adminId } });
  return { batchId: batch.id, requests: requests.length };
}

export async function collectThemeBatch(recordId: string) {
  const anthropic = getClaudeClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const record = await db.essayThemeBatch.findUnique({ where: { id: recordId } });
  if (!record || record.collectedAt) return { status: "collected" as const, created: 0, failed: 0 };
  const batch = await anthropic.messages.batches.retrieve(record.batchId);
  if (batch.processing_status !== "ended") {
    await db.essayThemeBatch.update({ where: { id: record.id }, data: { status: batch.processing_status } });
    return { status: batch.processing_status, created: 0, failed: 0 };
  }
  const map = (record.requests ?? {}) as Record<string, string>;
  let created = 0;
  let failed = 0;
  for await (const result of await anthropic.messages.batches.results(record.batchId)) {
    const competitionId = map[result.custom_id];
    if (!competitionId) continue;
    if (result.result.type !== "succeeded") {
      failed++;
      continue;
    }
    const message = result.result.message;
    await recordAiUsage({
      userId: null,
      feature: "ESSAY_THEME",
      model: message.model,
      batch: true,
      refId: competitionId,
      usage: { input: message.usage.input_tokens, output: message.usage.output_tokens, cacheRead: message.usage.cache_read_input_tokens ?? 0, cacheWrite: message.usage.cache_creation_input_tokens ?? 0 },
    });
    try {
      created += await saveDrafts(competitionId, message.model, parseStructured(message as unknown as Anthropic.Beta.BetaMessage, themesSchema));
    } catch {
      failed++;
    }
  }
  await db.essayThemeBatch.update({ where: { id: record.id }, data: { status: "ended", collectedAt: new Date() } });
  return { status: "ended" as const, created, failed };
}
