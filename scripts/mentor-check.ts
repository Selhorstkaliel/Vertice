/**
 * Verifies the Vértice Mentor against the real AI provider configured in .env
 * (Anthropic, Gemini or any OpenAI-compatible API).
 *
 *   npm run mentor:check                       # conexão + uma resposta completa com a conta demo
 *   npm run mentor:check -- --email=a@b.com    # usa outra conta já cadastrada
 *   npm run mentor:check -- --pergunta="..."   # outra pergunta
 *
 * Uses real quota or tokens (reported at the end). Nothing is saved to the
 * conversation; suggestions created during the check are removed afterwards.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { firstName, formatClock, weekdayName } from "@/lib/format";
import { isoWeekdayOfKey, localNow } from "@/lib/time";
import { buildMentorRequest, describeMentorError, getMentorClient, isFallbackRejection, mentorFallbacksActive, MentorProviderError, runMentorTurn } from "@/modules/mentor/llm";
import { mentorProvider } from "@/modules/mentor/provider";
import { compatRequest } from "@/modules/mentor/providers/openai-compatible";
import { estimateCostUsd } from "@/modules/ai/usage";
import { chatGptResponse } from "@/modules/ai/chatgpt";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const EMAIL = arg("email") ?? "demo@vertice.app";
const QUESTION = arg("pergunta") ?? "Onde estou perdendo mais pontos e o que devo priorizar nesta semana? Seja breve.";


let failures = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "OK   " : "FALHA"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
};

function cost(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
  const provider = mentorProvider();
  if (provider.id === "chatgpt") return "franquia do seu plano ChatGPT (não é cobrança por tokens da API)";
  if (provider.id === "gemini") return "sem custo dentro dos limites do plano gratuito do Gemini";
  const usd = estimateCostUsd(model, u);
  if (usd === null) return "preço deste modelo não cadastrado em src/modules/ai/usage.ts";
  return `≈ US$ ${usd.toFixed(3)}`;
}

function explain(err: unknown) {
  const detail = err instanceof MentorProviderError ? `HTTP ${err.status ?? "sem resposta"} ${err.message}` : err instanceof Anthropic.APIError ? `HTTP ${err.status} ${err.message}` : err instanceof Error ? err.message : String(err);
  return `${describeMentorError(err).message}\n   detalhe: ${detail.slice(0, 400)}`;
}

/** Smallest possible call: proves the key, the model name and the endpoint. */
async function ping(): Promise<{ text: string; model: string }> {
  const provider = mentorProvider();
  if (provider.id === "chatgpt") {
    const result = await chatGptResponse({ instructions: "Responda brevemente.", input: [{ role: "user", content: "Responda apenas com a palavra OK." }] });
    return { text: result.text, model: result.model };
  }
  if (provider.id === "anthropic") {
    const client = getMentorClient()!;
    const run = () => client.beta.messages.create({ ...buildMentorRequest([{ role: "user", content: "Responda apenas com a palavra OK." }], true), max_tokens: 2000, stream: false });
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await run();
    } catch (err) {
      if (!(mentorFallbacksActive() && isFallbackRejection(err))) throw err;
      console.log("Aviso: a conta recusou o parâmetro beta de fallbacks. Recomendado: MENTOR_FALLBACKS=off no .env.");
      env.MENTOR_FALLBACKS = "off";
      message = await run();
    }
    return { text: message.content.map((b) => (b.type === "text" ? b.text : "")).join(""), model: message.model };
  }
  const response = await compatRequest(provider, { model: provider.model, messages: [{ role: "user", content: "Responda apenas com a palavra OK." }], stream: false }, new AbortController().signal);
  const json = (await response.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  return { text: json.choices?.[0]?.message?.content ?? "", model: json.model ?? provider.model };
}

/** Lets pending sockets close instead of killing the process mid-request (crashes libuv on Windows). */
async function end(code: number) {
  await db.$disconnect().catch(() => undefined);
  process.exitCode = code;
}

async function main() {
  const provider = mentorProvider();
  if (!provider.configured) {
    const hint =
      provider.id === "chatgpt"
        ? "Execute npm run chatgpt -- conectar e autorize o uso do seu plano."
        : provider.id === "gemini"
        ? "GEMINI_API_KEY não está definida no .env. Crie a chave em https://aistudio.google.com/apikey e rode de novo."
        : provider.id === "openai-compatible"
          ? "Defina MENTOR_BASE_URL e MENTOR_MODEL no .env (e MENTOR_API_KEY, se o provedor exigir)."
          : "ANTHROPIC_API_KEY não está definida no .env. Adicione a chave ou use MENTOR_PROVIDER=gemini.";
    console.log(hint);
    return end(2);
  }
  console.log(`Provedor: ${provider.label}. Modelo: ${provider.model}. Esforço: ${env.MENTOR_EFFORT ?? "padrão"}.\n`);

  try {
    const first = await ping();
    check("chave aceita e modelo disponível", /ok/i.test(first.text), `resposta "${first.text.trim().slice(0, 40)}", modelo ${first.model}`);
  } catch (err) {
    check("conexão com a API", false, explain(err));
    return end(1);
  }

  const user = await db.user.findUnique({ where: { email: EMAIL }, include: { profile: true } });
  if (!user?.profile) {
    check(`conta ${EMAIL} encontrada`, false, "rode npm run db:seed:demo ou informe --email");
    return end(1);
  }
  const tz = user.profile.timezone;
  const local = localNow(tz);
  const before = new Set((await db.aiRecommendation.findMany({ where: { userId: user.id }, select: { id: true } })).map((r) => r.id));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "text", text: `<contexto_atual>Hoje é ${weekdayName(isoWeekdayOfKey(local.key)).toLowerCase()}, ${local.key}, ${formatClock(local.minute)} (fuso ${tz}). Primeiro nome do estudante: ${firstName(user.name)}.</contexto_atual>` },
        { type: "text", text: QUESTION },
      ],
    },
  ];

  console.log(`\nPergunta (${EMAIL}): ${QUESTION}\n`);
  const started = Date.now();
  let firstTextAt: number | null = null;
  try {
    const result = await runMentorTurn(
      { userId: user.id, firstName: firstName(user.name), profile: user.profile },
      messages,
      (e) => {
        if (e.type === "status") process.stdout.write(`\n[${e.label}]\n`);
        else if (e.type === "text") {
          firstTextAt ??= Date.now();
          process.stdout.write(e.delta);
        }
      },
      new AbortController().signal,
      { text: "" },
    );
    console.log("\n");
    check("consultou os dados do estudante", result.sources.length > 0, result.sources.join(", ") || "nenhuma ferramenta usada");
    check("respondeu com texto", result.text.length > 40, `${result.text.length} caracteres`);
    check("citou números dos dados", /\d+\s?%|\d+ quest/.test(result.text));
    check("não prometeu aprovação", !/(garant|certeza)[^.]{0,40}aprova|chance de aprova/i.test(result.text));
    check("resposta completa", !result.truncated);
    const tokens = result.usage.input || result.usage.output ? `${result.usage.input} entrada, ${result.usage.cacheRead} lidos do cache, ${result.usage.output} saída` : "não informados pelo provedor";
    console.log(`\nTokens: ${tokens}.`);
    console.log(`Tempo: primeira palavra em ${firstTextAt ? ((firstTextAt - started) / 1000).toFixed(1) : "—"} s, total ${((Date.now() - started) / 1000).toFixed(1)} s. Custo: ${cost(result.model, result.usage)}.`);
  } catch (err) {
    check("resposta completa do Mentor", false, explain(err));
  } finally {
    const created = await db.aiRecommendation.deleteMany({ where: { userId: user.id, id: { notIn: [...before] } } });
    if (created.count) console.log(`Sugestões criadas durante a verificação foram removidas: ${created.count}.`);
  }

  console.log(failures === 0 ? `\nMentor verificado com ${provider.label}.` : `\n${failures} verificação(ões) falharam.`);
  await end(failures ? 1 : 0);
}

main();
