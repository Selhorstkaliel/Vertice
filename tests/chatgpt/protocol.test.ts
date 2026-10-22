import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatGptError, chatGptFailure, omitOptionalNulls, readChatGptStream, strictJsonSchema } from "../../src/modules/ai/chatgpt-protocol";

function stream(events: unknown[], chunkSize = 7, crlf = false) {
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("").replace(/\n/g, crlf ? "\r\n" : "\n"));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize)); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } });
}
const completed = { type: "response.completed", response: { model: "account-model", output: [{ type: "message", content: [{ type: "output_text", text: "Correção concluída." }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 30 } } } };

test("SSE handles UTF-8, CRLF and arbitrary byte boundaries and keeps cache accounting disjoint", async () => {
  const deltas: string[] = [];
  const result = await readChatGptStream(stream([{ type: "response.output_text.delta", delta: "Correção concluída." }, completed], 1, true), (delta) => deltas.push(delta));
  assert.equal(result.text, "Correção concluída.");
  assert.equal(deltas.join(""), result.text);
  assert.deepEqual(result.usage, { input: 70, output: 20, cacheRead: 30, cacheWrite: 0 });
});

test("items from output_item.done are used when response.completed carries an empty output", async () => {
  const call = { type: "function_call", call_id: "c1", name: "rotina", namespace: "mentor", arguments: "{}" };
  const message = { type: "message", content: [{ type: "output_text", text: "Pronto." }] };
  const result = await readChatGptStream(stream([
    { type: "response.output_item.done", output_index: 1, item: message },
    { type: "response.output_item.done", output_index: 0, item: call },
    { type: "response.completed", response: { model: "account-model", output: [], usage: { input_tokens: 10, output_tokens: 5 } } },
  ]));
  assert.deepEqual(result.output.map((item) => item.type), ["function_call", "message"]);
  assert.equal(result.text, "Pronto.");
});

test("partial text without response.completed is never accepted as a completed answer", async () => {
  await assert.rejects(readChatGptStream(stream([{ type: "response.output_text.delta", delta: "Nota: 9" }])), (error) => error instanceof ChatGptError && error.kind === "truncated");
});

test("quota error arriving after stream starts retains its actionable usage message", async () => {
  await assert.rejects(readChatGptStream(stream([{ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }])), (error) => error instanceof ChatGptError && error.kind === "quota" && error.message.includes("settings/Usage"));
});

test("refusal and incomplete output are distinct from valid JSON results", async () => {
  await assert.rejects(readChatGptStream(stream([{ type: "response.refusal.delta", delta: "Não" }, completed])), (error) => error instanceof ChatGptError && error.kind === "refusal");
  await assert.rejects(readChatGptStream(stream([{ type: "response.incomplete" }])), (error) => error instanceof ChatGptError && error.kind === "truncated");
});

test("HTTP errors do not leak response bodies", async () => {
  const error = chatGptFailure(403, { detail: "private content SECRET" }, "request-123");
  assert.equal(error.kind, "auth");
  assert.equal(error.requestId, "request-123");
  assert.ok(!error.message.includes("SECRET"));
  assert.equal(chatGptFailure(400, { error: "invalid_grant" }).kind, "auth");
});

test("strict schema preserves uppercase enum values and uppercase property names", () => {
  const input = { type: "OBJECT", properties: { TYPE: { type: "STRING", enum: ["EDITAL", "OUTRO"] }, extra: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "NUMBER" } }, required: ["x"] } } }, required: ["TYPE"] };
  const output = strictJsonSchema(input);
  assert.deepEqual((output.properties as Record<string, unknown>).TYPE, { type: "string", enum: ["EDITAL", "OUTRO"] });
  assert.deepEqual(output.required, ["TYPE", "extra"]);
  assert.equal(output.additionalProperties, false);
  assert.equal(input.type, "OBJECT");
});

test("strict schema and optional-null normalization keep existing validators usable", () => {
  const schema = { type: "OBJECT", properties: { title: { type: "STRING" }, optional: { type: "STRING" }, nullable: { type: "STRING", nullable: true } }, required: ["title", "nullable"] };
  assert.deepEqual(omitOptionalNulls({ title: "Edital", optional: null, nullable: null }, schema), { title: "Edital", nullable: null });
  assert.deepEqual((strictJsonSchema(schema).properties as Record<string, unknown>).nullable, { anyOf: [{ type: "string" }, { type: "null" }] });
});
