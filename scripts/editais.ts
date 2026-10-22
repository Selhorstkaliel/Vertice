/**
 * Busca automática de editais nas fontes oficiais.
 *
 *   npm run editais -- fontes                                  # cria/atualiza as fontes a partir de prisma/fontes-editais.json
 *   npm run editais -- verificar [--concurso=<slug>] [--forcar] # verifica as fontes e avisa os alunos de documentos novos (só o link)
 *   npm run editais -- continuar [--documento=<id>]            # lê com IA os editais e retificações pendentes ou pausados
 *   npm run editais -- situacao                                # resumo por fonte e por status
 *   npm run editais -- arquivo <slug> <arquivo.pdf> --fonte=URL [--titulo="..."] [--avisar]
 *   npm run editais -- dou [--data=AAAA-MM-DD]                 # fonte complementar: Diário Oficial (INLABS)
 *
 *   npm run editais -- auto                                    # verificar + continuar (até 5 leituras); o que `npm run dev`/`start` roda de hora em hora
 *
 * `npm run dev` e `npm start` rodam `auto` sozinhos (EDITAIS_AUTO=off desliga). Sem eles, use um agendador:
 *   0 7,13,19 * * *  cd /app && npm run editais -- auto
 * Nada é publicado ao aluno sem revisão em /admin/editais; o aviso imediato traz só o título e o link oficial.
 */
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { syncSources } from "@/modules/editais/sources";
import { checkAllSources, registerManualFile } from "@/modules/editais/verify";
import { editalAiConfigured, readPending } from "@/modules/editais/read";
import { checkDou } from "@/modules/editais/dou";

const args = process.argv.slice(2);
const command = args[0];
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => args.includes(`--${name}`);
const log = (m: string) => console.log(m);

async function main() {
  switch (command) {
    case "fontes": {
      const r = await syncSources();
      log(`Fontes: ${r.created} criadas, ${r.updated} atualizadas.`);
      if (r.missingCompetitions.length) log(`Concursos da lista que não existem no catálogo: ${r.missingCompetitions.join(", ")}`);
      break;
    }
    case "verificar": {
      const reports = await checkAllSources(log, { slug: opt("concurso"), force: flag("forcar") });
      const errors = reports.filter((r) => r.error);
      log(`\n${reports.length} fontes verificadas, ${reports.reduce((a, r) => a + r.new, 0)} documentos novos, ${errors.length} com erro.`);
      if (reports.length === 0) log("Nenhuma fonte vencida (intervalo mínimo entre verificações). Use --forcar para verificar agora.");
      break;
    }
    case "continuar": {
      if (!editalAiConfigured()) {
        log("Conecte a IA para ler editais: Configurações › Inteligência artificial (modo pessoal) ou GEMINI_API_KEY e EDITAL_AI_MODELS.");
        process.exitCode = 1;
        break;
      }
      const results = await readPending(log, { documentId: opt("documento") });
      log(`\n${results.filter((r) => r.done).length} de ${results.length} documentos lidos. Revise em /admin/editais.`);
      break;
    }
    case "auto": {
      // Started every hour by scripts/next.mjs while the Vértice runs: only due sources are visited.
      if ((await db.editalSource.count()) === 0) {
        const r = await syncSources();
        log(`Fontes criadas: ${r.created}.`);
      }
      const reports = await checkAllSources(log);
      const fresh = reports.reduce((a, r) => a + r.new, 0);
      if (reports.length) log(`${reports.length} fontes verificadas, ${fresh} documentos novos, ${reports.filter((r) => r.error).length} com erro.`);
      if (editalAiConfigured()) {
        const results = await readPending(log, { limit: 5 });
        if (results.length) log(`${results.filter((r) => r.done).length} de ${results.length} documentos lidos. Revise em /admin/editais.`);
      } else if (await db.editalDocument.count({ where: { status: "NEW" } })) {
        log("Há editais esperando leitura: conecte a IA (Configurações › Inteligência artificial).");
      }
      break;
    }
    case "situacao": {
      const sources = await db.editalSource.findMany({ include: { competition: { select: { slug: true } } }, orderBy: [{ competition: { slug: "asc" } }] });
      for (const s of sources) {
        const state = !s.active ? "inativa" : s.kind === "BROWSER_ONLY" ? "só navegador" : s.consecutiveFailures ? `${s.consecutiveFailures} falhas seguidas` : "ok";
        log(`${s.competition.slug.padEnd(20)} ${state.padEnd(18)} últ. verificação ${s.lastCheckedAt?.toISOString().slice(0, 16) ?? "nunca"}  ${s.url}${s.lastError ? `\n${" ".repeat(21)}erro: ${s.lastError}` : ""}`);
      }
      const byStatus = await db.editalDocument.groupBy({ by: ["status"], _count: { _all: true } });
      log(`\nDocumentos: ${byStatus.map((b) => `${b.status} ${b._count._all}`).join(", ") || "nenhum"}`);
      break;
    }
    case "arquivo": {
      const [slug, file] = args.slice(1).filter((a) => !a.startsWith("--"));
      const fonte = opt("fonte");
      if (!slug || !file || !fonte) throw new Error('Uso: npm run editais -- arquivo <slug> <arquivo.pdf> --fonte=URL [--titulo="..."] [--avisar]');
      const competition = await db.competition.findFirst({ where: { slug, ownerId: null }, select: { id: true } });
      if (!competition) throw new Error(`Concurso ${slug} não encontrado.`);
      const r = await registerManualFile({ competitionId: competition.id, bytes: new Uint8Array(await readFile(file)), sourceUrl: fonte, title: opt("titulo") ?? file.split(/[\\/]/).pop()!, announce: flag("avisar") });
      log(r.duplicate ? `Este PDF já estava registrado (${r.id}).` : `Documento registrado (${r.id}). Rode "continuar" para ler.`);
      break;
    }
    case "dou": {
      const r = await checkDou(log, opt("data"));
      log(`${r.found} atos novos encontrados no DOU.`);
      break;
    }
    default:
      log("Comandos: fontes, verificar, continuar, auto, situacao, arquivo, dou. Veja o cabeçalho de scripts/editais.ts.");
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
