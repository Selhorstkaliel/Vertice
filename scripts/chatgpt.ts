/** Local OAuth setup. Never accepts a pasted password, API key or Codex session. */
import { createServer } from "node:http";
import { once } from "node:events";
import { env } from "@/lib/env";
import { activeRegistration } from "@/modules/ai/chatgpt-store";
import { beginChatGptSignIn, completeChatGptSignIn, chatGptStore, disconnectChatGpt, CHATGPT_USAGE_URL } from "@/modules/ai/chatgpt-auth";
import { chatGptModels, chatGptResponse, selectChatGptModel } from "@/modules/ai/chatgpt";

async function connect() {
  // Listener starts before the authorization URL is created. Bind only to IPv4 loopback.
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Não foi possível iniciar o callback local.");
  const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const attempt = await beginChatGptSignIn(redirectUri, process.argv.includes("--nova-conta"));
    const completed = new Promise<Awaited<ReturnType<typeof completeChatGptSignIn>>>((resolve, reject) => {
      let receiving = false;
      timer = setTimeout(() => reject(new Error("O login expirou. Execute novamente npm run chatgpt -- conectar.")), 10 * 60_000);
      server.on("request", (req, res) => {
        const callback = new URL(req.url ?? "/", redirectUri);
        if (req.method !== "GET" || callback.pathname !== "/auth/callback" || req.headers.host !== `127.0.0.1:${address.port}`) { res.writeHead(404).end(); return; }
        if (callback.searchParams.get("state") !== attempt.state || receiving) { res.writeHead(400).end("Tentativa de login inválida."); return; }
        receiving = true;
        void completeChatGptSignIn(attempt, callback).then((registration) => {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).end("ChatGPT conectado ao Vértice. Você pode fechar esta aba e voltar ao terminal.");
          resolve(registration);
        }, (error: unknown) => {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).end("Não foi possível concluir a conexão. Volte ao terminal e tente novamente.");
          reject(error);
        });
      });
    });
    console.log("Continue with ChatGPT — abra este endereço no navegador desta máquina:\n");
    console.log(attempt.url);
    console.log("\nEntre na sua conta e autorize o Vértice a usar seu plano. Aguardando por até 10 minutos…");
    const registration = await completed;
    if (!registration.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("A conta foi conectada, mas o uso do plano não foi autorizado. Reconecte e permita o uso do plano; a elegibilidade depende da OpenAI.");
    const model = await selectChatGptModel();
    console.log(`\nConectado: ${registration.email ?? "conta ChatGPT"}. Modelo disponível selecionado: ${model.display_name || model.slug}.`);
    console.log(`Questões, redações, Mentor e leitura de editais usarão seu plano. Gerencie a franquia em ${CHATGPT_USAGE_URL}`);
  } finally {
    if (timer) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main() {
  const command = process.argv[2] ?? "status";
  if (command === "status") {
    const state = await chatGptStore.read();
    const registration = activeRegistration(state);
    console.log(`Modo pessoal: ${env.CHATGPT_PERSONAL_MODE}.`);
    console.log(registration?.accessToken ? `Conta: ${registration.email ?? "ChatGPT"}. Uso do plano: ${registration.scopes.includes("chatgpt.tokens.use.direct") ? "autorizado" : "não autorizado"}. Modelo: ${env.CHATGPT_MODEL ?? registration.model ?? "a selecionar"}.` : "ChatGPT desconectado. Execute npm run chatgpt -- conectar.");
    state?.registrations.forEach((r, index) => console.log(`${index + 1}. ${r.email ?? "Conta ChatGPT"}${r.clientId === state.activeClientId ? " (ativa)" : ""}`));
    console.log(`Gerenciar uso: ${CHATGPT_USAGE_URL}`);
    return;
  }
  if (command === "desconectar") {
    const result = await disconnectChatGpt();
    console.log(result.revoked ? "ChatGPT desconectado e autorização revogada." : `ChatGPT desconectado localmente. Não foi possível confirmar a revogação remota; desconecte o Vértice também em ${CHATGPT_USAGE_URL}.`);
    return;
  }
  if (env.CHATGPT_PERSONAL_MODE !== "on") throw new Error("Defina CHATGPT_PERSONAL_MODE=on no .env para usar a conexão pessoal do ChatGPT.");
  if (command === "conectar") return connect();
  if (command === "modelos") {
    for (const model of await chatGptModels()) console.log(`${model.slug} — ${model.display_name}`);
    return;
  }
  if (command === "usar") {
    const index = Number(process.argv[3]) - 1;
    await chatGptStore.locked(async () => {
      const state = await chatGptStore.read();
      const registration = state?.registrations[index];
      if (!state || !registration) throw new Error("Informe o número de uma conta exibida por npm run chatgpt -- status.");
      state.activeClientId = registration.clientId;
      await chatGptStore.save(state);
    });
    console.log("Conta selecionada. Se necessário, execute npm run chatgpt -- conectar para renovar a autorização.");
    return;
  }
  if (command === "verificar") {
    const model = await selectChatGptModel();
    const result = await chatGptResponse({ model: model.slug, instructions: "Responda em português.", input: [{ role: "user", content: "Responda apenas: Conexão funcionando." }] });
    if (!result.text.trim()) throw new Error("O ChatGPT concluiu sem texto.");
    console.log(result.text);
    console.log(`Modelo: ${result.model}. Esta verificação consumiu uma pequena parte da franquia do seu plano.`);
    return;
  }
  throw new Error("Uso: npm run chatgpt -- conectar [--nova-conta] | status | modelos | usar <número> | verificar | desconectar");
}

main().catch((error: unknown) => {
  // Never dump token responses, callback URLs/codes or raw provider bodies.
  console.error(error instanceof Error ? error.message : "Falha na conexão do ChatGPT.");
  process.exitCode = 1;
});
