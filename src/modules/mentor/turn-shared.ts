import "server-only";
import type { MentorContext } from "./data";
import { TOOL_LABELS, executeTool, type ToolOutcome, type ToolRunState } from "./tools";

export type MentorStreamEvent = { type: "status"; label: string } | { type: "text"; delta: string } | { type: "discard" };

export interface MentorTurnResult {
  text: string;
  sources: string[];
  recommendationIds: string[];
  model: string;
  truncated: boolean;
  refused: boolean;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export class MentorRefusalError extends Error {}

/** HTTP failure from an AI provider, normalized so every provider maps to the same student messages. */
export class MentorProviderError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    /** Seconds the provider asked to wait before retrying, when it said so. */
    readonly retryAfterSec: number | null = null,
    /** A daily quota is exhausted: waiting seconds will not help. */
    readonly dailyQuota = false,
  ) {
    super(message);
    this.name = "MentorProviderError";
  }
}

export interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Runs the tool calls of one model round: reads in parallel, proposals one at a
 * time (they change the recommendation list). Records sources for explainability.
 */
export async function runToolCalls(
  ctx: MentorContext,
  calls: PendingToolCall[],
  state: ToolRunState,
  sources: Set<string>,
  emit: (event: MentorStreamEvent) => void,
): Promise<Map<string, ToolOutcome>> {
  for (const call of calls) {
    const label = TOOL_LABELS[call.name];
    if (label) {
      sources.add(label.source);
      emit({ type: "status", label: label.running });
    }
  }
  const results = new Map<string, ToolOutcome>();
  const reads = calls.filter((c) => !c.name.startsWith("propor_"));
  const writes = calls.filter((c) => c.name.startsWith("propor_"));
  await Promise.all(reads.map(async (c) => results.set(c.id, await executeTool(ctx, c.name, c.input, state))));
  for (const c of writes) results.set(c.id, await executeTool(ctx, c.name, c.input, state));
  return results;
}
