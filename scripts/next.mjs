import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";

// Automatic edital search state (see startEditais below).
let timer;
let running = null;

const [command = "dev", ...args] = process.argv.slice(2);
nextEnv.loadEnvConfig(process.cwd(), command === "dev");
const personal = process.env.CHATGPT_PERSONAL_MODE === "on";
if (personal && args.some((arg) => arg === "-H" || arg.startsWith("-H=") || arg === "--hostname" || arg.startsWith("--hostname="))) {
  console.error("No modo pessoal, o Vértice usa apenas 127.0.0.1. Remova a opção de hostname.");
  process.exitCode = 1;
} else {
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), command, ...args, ...(personal ? ["--hostname", "127.0.0.1"] : [])], { stdio: "inherit", env: process.env });
  child.on("error", () => { console.error("Não foi possível iniciar o Vértice."); process.exitCode = 1; });
  child.on("exit", (code) => { stopEditais(); process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopEditais(); child.kill(signal); });
  startEditais();
}

/*
 * Automatic edital search while the Vértice runs: `npm run editais -- auto` in a
 * separate process (never inside the web server), one run at a time. Each
 * source keeps its own minimum interval (EDITAIS_MIN_INTERVAL_HOURS), so an
 * hourly run only visits what is due. EDITAIS_AUTO=off turns it off.
 */
function startEditais() {
  if (process.env.EDITAIS_AUTO === "off") return;
  const everyMin = Math.max(15, Number(process.env.EDITAIS_AUTO_EVERY_MIN) || 60);
  const run = () => {
    if (running) return;
    running = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/editais.ts", "auto"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [running.stdout, running.stderr]) createInterface({ input: stream }).on("line", (line) => line.trim() && console.log(`[editais] ${line}`));
    running.on("exit", () => { running = null; });
    running.on("error", () => { running = null; console.error("[editais] não foi possível iniciar a busca automática."); });
  };
  // First run after the server is up; then on the interval.
  timer = setTimeout(function tick() { run(); timer = setTimeout(tick, everyMin * 60_000); }, 90_000);
  console.log(`[editais] busca automática ligada: a cada ${everyMin} min (EDITAIS_AUTO=off desliga).`);
}
function stopEditais() {
  clearTimeout(timer);
  running?.kill();
}
