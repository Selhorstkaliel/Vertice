import "server-only";
import { limitsFor } from "@/lib/plan-limits";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { localNow, zonedToUtc } from "@/lib/time";
import { getRecommendationViews, type RecommendationCardView } from "@/modules/recommendations/service";
import { isMentorAiConfigured } from "./llm";
import { mentorPrivacyNote, mentorProvider } from "./provider";

export interface MentorGrounding {
  mode: "ai" | "rules";
  sources?: string[];
  recommendationIds?: string[];
  model?: string;
  truncated?: boolean;
  interrupted?: boolean;
  refused?: boolean;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface MentorMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  mode: "ai" | "rules" | null;
  sources: string[];
  truncated: boolean;
  interrupted: boolean;
  recommendations: RecommendationCardView[];
}

export const asGrounding = (g: MentorGrounding) => g as unknown as Prisma.InputJsonValue;

export async function toMessageViews(
  userId: string,
  rows: { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date; grounding: Prisma.JsonValue }[],
): Promise<MentorMessageView[]> {
  const groundings = rows.map((r) => (r.grounding ?? null) as MentorGrounding | null);
  const recs = await getRecommendationViews(userId, groundings.flatMap((g) => g?.recommendationIds ?? []));
  return rows.map((r, i) => {
    const g = groundings[i];
    return {
      id: r.id,
      role: r.role === "USER" ? "user" : "assistant",
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      mode: g?.mode ?? null,
      sources: g?.sources ?? [],
      truncated: !!g?.truncated,
      interrupted: !!g?.interrupted,
      recommendations: (g?.recommendationIds ?? []).map((id) => recs.get(id)).filter((v): v is RecommendationCardView => !!v),
    };
  });
}

export async function getMentorThread(userId: string, limit = 60) {
  const rows = await db.mentorMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return toMessageViews(userId, rows.reverse());
}

/** Recent turns in API shape. Past tool calls are not replayed: answers already carry their conclusions. */
export async function loadApiHistory(userId: string, excludeId: string, limit = 30): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await db.mentorMessage.findMany({
    where: { userId, id: { not: excludeId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });
  const ordered = rows.reverse().filter((r) => r.content.trim());
  while (ordered[0] && ordered[0].role !== "USER") ordered.shift();
  return ordered.map((r) => ({ role: r.role === "USER" ? "user" : "assistant", content: r.content }));
}

export async function mentorUsageToday(userId: string, tz: string) {
  const today = localNow(tz).key;
  return db.mentorMessage.count({
    where: { userId, role: "USER", createdAt: { gte: zonedToUtc(today, 0, tz) }, grounding: { path: ["mode"], equals: "ai" } },
  });
}

export async function getMentorStatus(userId: string, tz: string) {
  const configured = isMentorAiConfigured();
  return {
    aiEnabled: configured,
    model: configured ? mentorProvider().model : null,
    privacyNote: mentorPrivacyNote(),
    dailyLimit: limitsFor({ id: userId }).mentorDailyMessages,
    usedToday: configured ? await mentorUsageToday(userId, tz) : 0,
  };
}
