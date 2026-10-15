import "server-only";
import { Prisma, type AiFeature } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * USD per million tokens, Anthropic first-party rates (checked 2026-10).
 * Cache writes (5-minute TTL) cost 1.25× input; batch calls cost half. Cache
 * reads are the published rates; for Haiku 5.5 the usual 0.1× of input is assumed.
 * A model missing here is logged without a cost rather than with a guess.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

export function estimateCostUsd(model: string, u: TokenUsage, batch = false): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const usd = (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000;
  return batch ? usd / 2 : usd;
}

export async function recordAiUsage(entry: { userId: string | null; feature: AiFeature; model: string; usage: TokenUsage; batch?: boolean; refId?: string | null }) {
  await db.aiUsage.create({
    data: {
      userId: entry.userId,
      feature: entry.feature,
      model: entry.model,
      inputTokens: entry.usage.input,
      outputTokens: entry.usage.output,
      cacheReadTokens: entry.usage.cacheRead,
      cacheWriteTokens: entry.usage.cacheWrite,
      batch: entry.batch ?? false,
      costUsd: estimateCostUsd(entry.model, entry.usage, entry.batch),
      refId: entry.refId ?? null,
    },
  });
}

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  ESSAY_CORRECTION: "Correção de redação (duas correções por redação)",
  ESSAY_REWRITE: "Reescrita de parágrafo",
  ESSAY_THEME: "Geração de temas",
  MENTOR: "Mensagem do Mentor",
  QUESTION_AI: "Leitura de provas e questões",
  EDITAL_READING: "Leitura de editais",
};

/**
 * Admin cost report over a period: average cost per call of each feature and
 * per active student (students with any AI usage in the period).
 */
export async function aiCostReport(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  // Calibration runs (refId "calibracao:*") are not student usage.
  const real: Prisma.AiUsageWhereInput = { createdAt: { gte: since }, OR: [{ refId: null }, { NOT: { refId: { startsWith: "calibracao:" } } }] };
  const [byFeature, byModel, students, totals] = await Promise.all([
    db.aiUsage.groupBy({
      by: ["feature"],
      where: real,
      _count: { _all: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true },
      _avg: { costUsd: true },
    }),
    db.aiUsage.groupBy({ by: ["feature", "model"], where: real, _count: { _all: true }, _avg: { costUsd: true } }),
    db.$queryRaw<{ users: bigint; cost: number | null }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "userId") AS users, SUM("costUsd") AS cost
        FROM "AiUsage" WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL`),
    db.aiUsage.aggregate({ where: real, _sum: { costUsd: true }, _count: { _all: true } }),
  ]);
  const unpriced = await db.aiUsage.count({ where: { ...real, costUsd: null } });
  const users = Number(students[0]?.users ?? 0);
  return {
    days,
    totalCost: totals._sum.costUsd ?? 0,
    calls: totals._count._all,
    unpriced,
    activeStudents: users,
    costPerActiveStudent: users ? (students[0]?.cost ?? 0) / users : null,
    features: byFeature
      .map((f) => ({
        feature: f.feature,
        label: AI_FEATURE_LABEL[f.feature],
        calls: f._count._all,
        totalCost: f._sum.costUsd ?? 0,
        avgCost: f._avg.costUsd,
        avgInput: f._count._all ? (f._sum.inputTokens ?? 0) / f._count._all : 0,
        avgOutput: f._count._all ? (f._sum.outputTokens ?? 0) / f._count._all : 0,
        cacheShare: (f._sum.inputTokens ?? 0) + (f._sum.cacheReadTokens ?? 0) > 0 ? (f._sum.cacheReadTokens ?? 0) / ((f._sum.inputTokens ?? 0) + (f._sum.cacheReadTokens ?? 0)) : null,
      }))
      .sort((a, b) => b.totalCost - a.totalCost),
    models: byModel.map((m) => ({ feature: m.feature, model: m.model, calls: m._count._all, avgCost: m._avg.costUsd })),
  };
}
