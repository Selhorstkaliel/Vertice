import "server-only";
import { env } from "@/lib/env";
import { chatGptResponse, ChatGptError } from "@/modules/ai/chatgpt";
import type { MentorContext } from "../data";
import { MENTOR_SYSTEM_PROMPT } from "../prompt";
import { MENTOR_TOOLS, type ToolRunState } from "../tools";
import { MentorRefusalError, runToolCalls, type MentorStreamEvent, type MentorTurnResult } from "../turn-shared";
import type { SimpleMessage } from "./openai-compatible";

const TOOLS = [{ type: "namespace", name: "mentor", description: "Consultar os dados do estudante e propor mudanças para ele revisar.", tools: MENTOR_TOOLS.map((tool) => ({
  type: "function", name: tool.name, description: tool.description, parameters: tool.input_schema, strict: false,
})) }];

/** Same validated, student-scoped tools and recommendation approval flow as other providers. */
export async function runChatGptTurn(ctx: MentorContext, history: SimpleMessage[], emit: (event: MentorStreamEvent) => void, signal: AbortSignal, partial: { text: string }): Promise<MentorTurnResult> {
  const input: Record<string, unknown>[] = history.map((message) => ({ ...message }));
  const state: ToolRunState = { proposals: 0, recommendationIds: [] };
  const sources = new Set<string>();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model = "";
  for (let round = 0; round < env.MENTOR_MAX_ROUNDS; round++) {
    signal.throwIfAborted();
    let roundText = "";
    try {
      const result = await chatGptResponse({
        input, instructions: MENTOR_SYSTEM_PROMPT, tools: TOOLS, tool_choice: round === env.MENTOR_MAX_ROUNDS - 1 ? "none" : "auto", signal,
        onText: (delta) => {
          if (!roundText && partial.text) { partial.text += "\n\n"; emit({ type: "text", delta: "\n\n" }); }
          roundText += delta;
          partial.text += delta;
          emit({ type: "text", delta });
        },
      });
      model = result.model;
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      usage.cacheRead += result.usage.cacheRead;
      const calls = result.output.filter((item) => item.type === "function_call");
      if (!calls.length) {
        // Some transports return final output without output_text.delta events.
        if (!roundText && result.text) { partial.text += result.text; emit({ type: "text", delta: result.text }); }
        return { text: partial.text.trim(), sources: [...sources], recommendationIds: state.recommendationIds, model, truncated: false, refused: false, usage };
      }
      if (round === env.MENTOR_MAX_ROUNDS - 1) throw new ChatGptError("O ChatGPT não concluiu a resposta no limite de consultas.", "truncated");
      signal.throwIfAborted();
      const pending = calls.map((call) => {
        if (!call.call_id || !call.name || call.namespace !== "mentor") throw new ChatGptError("O ChatGPT devolveu uma consulta inválida.", "invalid");
        let args: unknown;
        try { args = JSON.parse(call.arguments ?? "{}"); }
        catch { args = { __invalid_json: true }; }
        return { id: call.call_id, name: call.name, input: args };
      });
      const results = await runToolCalls(ctx, pending, state, sources, emit);
      // store:false: replay ALL outputs, including encrypted reasoning, before tool results.
      input.push(...result.output);
      for (const call of pending) {
        const outcome = results.get(call.id)!;
        input.push({ type: "function_call_output", call_id: call.id, output: outcome.isError ? `ERRO: ${outcome.content}` : outcome.content });
      }
    } catch (error) {
      // No successful response or tool execution is inferred from partial streaming output.
      partial.text = partial.text.slice(0, partial.text.length - roundText.length).trimEnd();
      emit({ type: "discard" });
      if (error instanceof ChatGptError && error.kind === "refusal") throw new MentorRefusalError();
      throw error;
    }
  }
  throw new ChatGptError("O ChatGPT não concluiu a resposta.", "truncated");
}
