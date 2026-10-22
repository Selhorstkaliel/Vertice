import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { z } from "zod";
import type { MentorContext } from "../../src/modules/mentor/data";

// All credentials and requests below are synthetic. No network or student DB is used.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5433/test";
process.env.SESSION_SECRET = "chatgpt-offline-tests-secret-at-least-32";
process.env.CHATGPT_PERSONAL_MODE = "on";
process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
delete process.env.CHATGPT_MODEL;
const dir = await mkdtemp(path.join(os.tmpdir(), "vertice-chatgpt-integration-"));
process.env.STORAGE_DIR = path.join(dir, "storage");
const originalFetch = globalThis.fetch;
const auth = await import("../../src/modules/ai/chatgpt-auth");
// Isolate the singleton's storage before any read/write; never touch the real connection.
Object.assign(auth.chatGptStore, { directory: path.join(dir, "auth"), file: path.join(dir, "auth", "connection.enc") });
const client = await import("../../src/modules/ai/chatgpt");
const docs = await import("../../src/modules/ai/documents");
const { activeRegistration } = await import("../../src/modules/ai/chatgpt-store");
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "offline-key", alg: "RS256", use: "sig" };
let expectedNonce = "";
let expectedChallenge = "";
let tokenCalls = 0;
let refreshMode: "ok" | "unavailable" | "expired" = "ok";
let responseHandler: (body: Record<string, unknown>) => Response = () => { throw new Error("Unexpected inference"); };
const requests: Record<string, unknown>[] = [];

function result(text: string, output?: Record<string, unknown>[]) {
  const events = [
    ...(text ? [{ type: "response.output_text.delta", delta: text }] : []),
    { type: "response.completed", response: { model: "offline-model", output: output ?? [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }], usage: { input_tokens: 50, output_tokens: 15 } } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/.well-known/openid-configuration")) return Response.json({ issuer: "https://auth.openai.com", authorization_endpoint: "https://auth.openai.com/api/accounts/authorize", token_endpoint: "https://auth.openai.com/api/accounts/oauth/token", jwks_uri: "https://auth.openai.com/jwks", revocation_endpoint: "https://auth.openai.com/revoke" });
  if (url === "https://auth.openai.com/jwks") return Response.json({ keys: [jwk] });
  if (url.endsWith("/api/accounts/oauth/token")) {
    tokenCalls++;
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("client_id"), "offline-client");
    assert.equal(body.get("resource"), "https://api.openai.com/v1");
    if (body.get("grant_type") === "refresh_token") {
      if (refreshMode === "unavailable") return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
      if (refreshMode === "expired") return Response.json({ error: "invalid_grant" }, { status: 400 });
      assert.equal(body.get("scope"), null);
      return Response.json({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600 });
    }
    assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), expectedChallenge);
    const id = await new SignJWT({ nonce: expectedNonce, email: "offline@example.test" }).setProtectedHeader({ alg: "RS256", kid: "offline-key" }).setIssuer("https://auth.openai.com").setAudience("offline-client").setSubject("offline-user").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    return Response.json({ access_token: "offline-access", refresh_token: "offline-refresh", id_token: id, expires_in: 3600, scope: auth.CHATGPT_SCOPES });
  }
  if (url === "https://api.openai.com/v1/models") return Response.json({ models: [{ slug: "hidden", display_name: "Hidden", visibility: "hide" }, { slug: "offline-model", display_name: "Offline test", visibility: "list" }] });
  if (url === "https://api.openai.com/v1/responses") {
    assert.match(new Headers(init?.headers).get("Authorization") ?? "", /^Bearer (offline-access|rotated-access)$/);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    for (const unsupported of ["temperature", "max_output_tokens", "previous_response_id", "conversation", "metadata", "prompt"]) assert.ok(!(unsupported in body), unsupported);
    return responseHandler(body);
  }
  if (url === "https://auth.openai.com/revoke") return new Response(null, { status: 200 });
  throw new Error(`External network forbidden in this test: ${url}`);
};
after(async () => { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); });

test("official OAuth validates state, PKCE, signed identity, nonce and issued registration", async () => {
  const attempt = await auth.beginChatGptSignIn("http://127.0.0.1:1455/auth/callback");
  const url = new URL(attempt.url);
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(url.searchParams.get("agent_name_hint"), "Vértice");
  assert.ok(url.searchParams.get("ext_agent_host_id")?.startsWith("urn:uuid:"));
  expectedNonce = attempt.nonce;
  expectedChallenge = url.searchParams.get("code_challenge")!;
  const callback = new URL(attempt.redirectUri);
  callback.search = new URLSearchParams({ code: "test-code", state: "incorrect", client_id: "offline-client" }).toString();
  await assert.rejects(auth.completeChatGptSignIn(attempt, callback));
  assert.equal(tokenCalls, 0);
  callback.searchParams.set("state", attempt.state);
  const registration = await auth.completeChatGptSignIn(attempt, callback);
  assert.equal(registration.subject, "offline-user");
  assert.equal(auth.chatGptConfigured(), true);
  const model = await client.selectChatGptModel();
  assert.equal(model.slug, "offline-model");
  const returning = await auth.beginChatGptSignIn("http://127.0.0.1:54321/auth/callback");
  const returningUrl = new URL(returning.url);
  assert.equal(returningUrl.searchParams.get("client_id"), "offline-client");
  assert.equal(returningUrl.searchParams.get("agent_name_hint"), null);
  assert.equal(returningUrl.searchParams.get("ext_agent_host_id"), url.searchParams.get("ext_agent_host_id"));
  await assert.rejects(auth.beginChatGptSignIn("http://localhost:1455/auth/callback"));
});

test("a forged nonce cannot replace a previously validated connection", async () => {
  const attempt = await auth.beginChatGptSignIn("http://127.0.0.1:1455/auth/callback");
  expectedNonce = "wrong-nonce";
  expectedChallenge = new URL(attempt.url).searchParams.get("code_challenge")!;
  const callback = new URL(attempt.redirectUri);
  callback.search = new URLSearchParams({ code: "test-code", state: attempt.state }).toString();
  await assert.rejects(auth.completeChatGptSignIn(attempt, callback));
  assert.equal(activeRegistration(await auth.chatGptStore.read())?.accessToken, "offline-access");
});

test("questions and edital classification use the plan route and strict JSON, without Gemini", async () => {
  responseHandler = () => result(JSON.stringify({ tipo: "EDITAL" }));
  const classified = await docs.generateJson<{ tipo: string }>({ parts: [{ text: "EDITAL DE ABERTURA" }], schema: { type: "OBJECT", properties: { tipo: { type: "STRING", enum: ["EDITAL", "OUTRO"] } }, required: ["tipo"] }, models: ["gemini-must-not-be-used"] });
  assert.equal(classified.data.tipo, "EDITAL");
  assert.equal(classified.model, "offline-model");
  assert.equal(docs.questionAiConfigured(), true);
  assert.equal(docs.editalAiReady(), true);
  assert.equal(requests.at(-1)?.model, "offline-model");
});

test("PDFs remain private local references and are embedded as file_data rather than uploaded to a Files API", async () => {
  const bytes = Buffer.from("%PDF-1.4\nOffline fixture");
  const uploaded = await docs.uploadPdf(bytes, "Prova e gabarito");
  assert.match(uploaded.uri, /^vertice-local-pdf:/);
  assert.equal(docs.reusableAiFile("https://generativelanguage.googleapis.com/old-file"), false);
  responseHandler = (body) => {
    const content = (body.input as { content: Record<string, unknown>[] }[])[0]!.content;
    assert.equal(content[0]?.file_data, `data:application/pdf;base64,${bytes.toString("base64")}`);
    assert.equal(content[0]?.type, "input_file");
    return result('{"questions":[]}');
  };
  const answer = await docs.generateJson<{ questions: unknown[] }>({ parts: [{ fileUri: uploaded.uri, mimeType: "application/pdf" }], schema: { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["questions"] } });
  assert.deepEqual(answer.data.questions, []);
});

test("essay correction uses the connected plan, validates output, and records both attempts", async () => {
  const { db } = await import("../../src/lib/db");
  const original = db.aiUsage.create;
  let recorded = 0;
  db.aiUsage.create = (async () => { recorded++; return {}; }) as unknown as typeof db.aiUsage.create;
  try {
    const essay = await import("../../src/modules/ai/structured");
    assert.equal(essay.essayProvider(), "chatgpt");
    assert.equal(essay.essayAiConfigured(), true);
    assert.equal(essay.essayModel("correction"), "offline-model");
    let calls = 0;
    responseHandler = () => result(calls++ === 0 ? '{"score":"invalid"}' : '{"score":7.5}');
    const corrected = await essay.essayStructuredCall({ feature: "ESSAY_CORRECTION", userId: "offline-local-user", model: "offline-model", effort: "high", maxTokens: 100, system: ["Corrija pela rubrica."], user: "Texto de exemplo.", jsonSchema: { type: "object", properties: { score: { type: "number" } }, required: ["score"] }, schema: z.object({ score: z.number() }) });
    assert.equal(corrected.data.score, 7.5);
    assert.equal(recorded, 2);
    assert.equal(corrected.usage.input, 100);
  } finally { db.aiUsage.create = original; }
});

test("Mentor replays tools and reasoning with full context and validates tool input before data access", async () => {
  const { mentorProvider } = await import("../../src/modules/mentor/provider");
  const { runChatGptTurn } = await import("../../src/modules/mentor/providers/chatgpt");
  assert.equal(mentorProvider().id, "chatgpt");
  let round = 0;
  responseHandler = (body) => {
    const tools = body.tools as { type: string; name: string }[];
    assert.equal(tools[0]?.type, "namespace");
    assert.equal(tools[0]?.name, "mentor");
    if (round++ === 0) return result("", [{ type: "reasoning", encrypted_content: "offline-reasoning" }, { type: "function_call", call_id: "call-test", name: "propor_ajuste_rotina", namespace: "mentor", arguments: '{}' }]);
    const history = body.input as Record<string, unknown>[];
    assert.ok(history.some((item) => item.encrypted_content === "offline-reasoning"));
    assert.ok(history.some((item) => item.type === "function_call_output" && String(item.output).includes("Parâmetros inválidos")));
    return result("Vamos revisar os dados antes de planejar.");
  };
  const partial = { text: "" };
  const answer = await runChatGptTurn({ userId: "offline-user", firstName: "Teste", profile: {} } as MentorContext, [{ role: "user", content: "Como estou?" }], () => undefined, new AbortController().signal, partial);
  assert.match(answer.text, /revisar/);
  assert.deepEqual(answer.sources, ["Sugestão de rotina"]);
  assert.equal(round, 2);
});

test("simultaneous refresh calls use the latest token and perform only one rotation", async () => {
  const state = (await auth.chatGptStore.read())!;
  activeRegistration(state)!.expiresAt = 0;
  await auth.chatGptStore.save(state);
  const before = tokenCalls;
  const [a, b] = await Promise.all([auth.chatGptAccess(), auth.chatGptAccess()]);
  assert.equal(a.accessToken, "rotated-access");
  assert.equal(b.accessToken, "rotated-access");
  assert.equal(tokenCalls - before, 1);
  assert.equal(activeRegistration(await auth.chatGptStore.read())!.refreshToken, "rotated-refresh");
});

test("transient refresh errors preserve credentials, terminal revocation clears them", async () => {
  const state = (await auth.chatGptStore.read())!;
  activeRegistration(state)!.expiresAt = 0;
  await auth.chatGptStore.save(state);
  refreshMode = "unavailable";
  await assert.rejects(auth.chatGptAccess());
  assert.equal(activeRegistration(await auth.chatGptStore.read())!.refreshToken, "rotated-refresh");
  refreshMode = "expired";
  await assert.rejects(auth.chatGptAccess());
  assert.equal(activeRegistration(await auth.chatGptStore.read())!.accessToken, undefined);
  assert.equal(auth.chatGptConfigured(), false);
  await assert.rejects(client.chatGptResponse({ instructions: "test", input: [{ role: "user", content: "test" }] }));
});
