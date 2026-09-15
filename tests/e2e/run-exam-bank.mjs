// npm run test:provas — end-to-end test of the official-exam question bank.
// Starts a stand-in for the Gemini API and the production build on port 3100
// (run `npm run build` first), then drives imports, review, publishing,
// student views and generation over HTTP. Nothing reaches Google.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const logs = mkdtempSync(path.join(tmpdir(), "vertice-e2e-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const stop = () => children.forEach((c) => c.kill());
process.on("exit", stop);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

children.push(spawn(process.execPath, [path.join(root, "tests/e2e/mock-gemini-native.mjs"), path.join(logs, "gemini-native-requests.jsonl")], { stdio: "ignore" }));
const nextBin = path.join(root, "node_modules/next/dist/bin/next");
children.push(
  spawn(process.execPath, [nextBin, "start", "-p", "3100"], {
    cwd: root,
    env: { ...process.env, GEMINI_API_KEY: "mock-gemini-key", GEMINI_BASE_URL: "http://localhost:4030", QUESTION_AI_MODELS: "gemini-mock-lite,gemini-mock-flash" },
    stdio: ["ignore", openSync(path.join(logs, "server-test.log"), "w"), openSync(path.join(logs, "server-test.log"), "a")],
  }),
);
await waitFor("http://localhost:4030/");
await waitFor("http://localhost:3100/entrar");

const test = spawn(process.execPath, [path.join(root, "tests/e2e/exam-bank.mjs"), logs, root], { stdio: "inherit" });
const code = await new Promise((resolve) => test.on("exit", resolve));
console.log(`\nLogs: ${logs}`);
stop();
process.exit(code ?? 1);
