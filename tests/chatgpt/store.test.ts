import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChatGptStore, activeRegistration, type ChatGptState } from "../../src/modules/ai/chatgpt-store";

test("credentials are encrypted, authenticated and readable only with the same installation secret", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vertice-chatgpt-store-"));
  try {
    const store = new ChatGptStore(dir, "test-secret-a");
    assert.equal(await store.read(), null);
    const state: ChatGptState = { version: 1, hostId: "urn:uuid:test-host", activeClientId: "test-client", registrations: [{ clientId: "test-client", subject: "test-user", scopes: ["chatgpt.tokens.use.direct"], accessToken: "very-private-access-token", refreshToken: "very-private-refresh-token", expiresAt: 100 }] };
    await store.save(state);
    const bytes = await readFile(store.file);
    assert.ok(!bytes.toString().includes("very-private"));
    assert.deepEqual(await store.read(), state);
    assert.equal(activeRegistration(store.readSync())?.subject, "test-user");
    await assert.rejects(new ChatGptStore(dir, "another-secret").read());
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    await writeFile(store.file, bytes);
    await assert.rejects(store.read());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("separate store instances serialize updates, without losing the latest rotating token", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vertice-chatgpt-lock-"));
  try {
    const a = new ChatGptStore(dir, "test-secret");
    const b = new ChatGptStore(dir, "test-secret");
    const sequence: string[] = [];
    await Promise.all([a.locked(async () => { sequence.push("a-start"); await new Promise((resolve) => setTimeout(resolve, 30)); sequence.push("a-end"); }), b.locked(async () => { sequence.push("b"); })]);
    assert.equal(Math.abs(sequence.indexOf("a-start") - sequence.indexOf("a-end")), 1);
    // Exceptions must release the lock too.
    await assert.rejects(a.locked(async () => { throw new Error("test failure"); }));
    assert.equal(await b.locked(async () => "unlocked"), "unlocked");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
