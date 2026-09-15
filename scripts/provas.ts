/**
 * Banco de questões a partir de provas oficiais.
 *
 *   npm run provas -- admin <email>                     # dá acesso de administrador (revisão e publicação)
 *   npm run provas -- importar [arquivo.json]           # baixa e lê as provas listadas (padrão: prisma/provas-oficiais.json)
 *   npm run provas -- importar --concurso=efomm         # só as provas de um concurso da lista
 *   npm run provas -- importar --pasta=C:\Downloads     # usa PDFs/ZIPs já baixados nessa pasta (sites que só abrem no navegador)
 *   npm run provas -- arquivo <concurso> <ano> "<versão>" prova.pdf [gabarito.pdf] [--fonte=URL] [--fonte-gabarito=URL]
 *   npm run provas -- continuar                         # retoma extrações pausadas (limite diário) ou com falha
 *   npm run provas -- situacao                          # resumo por prova
 *   npm run provas -- reverificar                       # reaplica gabarito e conferências nas provas já lidas
 *   npm run provas -- publicar                          # publica as questões sem nenhuma pendência das provas lidas por completo
 *   npm run provas -- limpar                            # apaga figuras e páginas que nenhuma questão usa mais
 *
 * A leitura usa a API do Gemini (GEMINI_API_KEY). No plano gratuito o limite
 * diário acaba rápido: tudo é salvo por lote e `continuar` segue de onde parou.
 * Nada é publicado aqui: as questões ficam em /admin/provas para revisão.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { availableModels, questionAiConfigured } from "@/modules/ai/gemini";
import { refreshPaper, runPaperExtraction } from "@/modules/exam-papers/extract";
import { isPdf, listFiles, removeFile } from "@/lib/storage";
import { approveCleanDrafts, createExamPaper, downloadFile } from "@/modules/exam-papers/service";

/**
 * A manifest address may point inside an official ZIP: "https://…/provas.zip#pasta/prova.pdf".
 * With --pasta, a file with the same name in that folder is used instead of downloading.
 */
const archives = new Map<string, Uint8Array>();

async function localCopy(name: string) {
  const folder = flag("pasta");
  if (!folder) return null;
  const candidate = path.join(folder, name);
  return (await stat(candidate).then((s) => s.isFile(), () => false)) ? new Uint8Array(await readFile(candidate)) : null;
}

async function fetchSource(address: string) {
  const [url = address, entry] = address.split("#");
  const fileName = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  let bytes: Uint8Array | null = archives.get(url) ?? (await localCopy(fileName));
  if (!bytes) {
    try {
      bytes = await downloadFile(url);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new DomainError(`${reason} Se o site só abre no navegador, baixe ${fileName} e rode de novo com --pasta=<pasta do download>.`);
    }
  }
  if (!entry) {
    if (!isPdf(bytes)) throw new DomainError(`${fileName} não é um PDF.`);
    return bytes;
  }
  archives.set(url, bytes);
  const wanted = decodeURIComponent(entry);
  const files = unzipSync(bytes, { filter: (f) => f.name === wanted });
  const pdf = files[wanted];
  if (!pdf || !isPdf(pdf)) throw new DomainError(`${wanted} não foi encontrado como PDF dentro de ${fileName}.`);
  return pdf;
}

interface ManifestEntry {
  concurso: string;
  ano: number;
  versao: string;
  titulo?: string;
  prova: string;
  gabarito?: string | null;
  observacao?: string;
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const positional = rest.filter((a) => !a.startsWith("--"));
const log = (message: string) => console.log(`  ${message}`);

function end(code: number) {
  process.exitCode = code;
  void db.$disconnect();
}

function requireAi() {
  if (!questionAiConfigured()) {
    console.error("Configure GEMINI_API_KEY no .env para ler provas.");
    end(1);
    return false;
  }
  return true;
}

async function competitionId(slug: string) {
  const competition = await db.competition.findFirst({ where: { slug, ownerId: null }, select: { id: true } });
  if (!competition) throw new DomainError(`Concurso "${slug}" não existe no catálogo. Rode npm run db:seed.`);
  return competition.id;
}

async function extractUntilPaused(paperIds: string[]) {
  for (const id of paperIds) {
    if (availableModels().length === 0) {
      console.log("\nLimite diário da IA atingido em todos os modelos. Rode `npm run provas -- continuar` amanhã.");
      return;
    }
    const paper = await db.examPaper.findUniqueOrThrow({ where: { id }, select: { title: true } });
    console.log(`\n▶ ${paper.title}`);
    const result = await runPaperExtraction(id, log);
    if (!result.ok) log(`⚠ ${result.message}`);
  }
}

async function main() {
  switch (command) {
    case "admin": {
      const email = positional[0]?.toLowerCase();
      if (!email) throw new DomainError("Informe o e-mail: npm run provas -- admin voce@exemplo.com");
      const { count } = await db.user.updateMany({ where: { email }, data: { isAdmin: true } });
      if (count === 0) throw new DomainError(`Nenhuma conta com o e-mail ${email}. Cadastre-se primeiro.`);
      console.log(`${email} agora é administrador. Acesse /admin/provas.`);
      return;
    }
    case "arquivo": {
      if (!requireAi()) return;
      const [slug, year, version, pdfPath, keyPath] = positional;
      if (!slug || !year || !version || !pdfPath) throw new DomainError('Uso: npm run provas -- arquivo efomm 2026 "2º dia, prova branca" prova.pdf [gabarito.pdf]');
      const paper = await createExamPaper(
        {
          competitionId: await competitionId(slug),
          year: Number(year),
          version,
          pdf: new Uint8Array(await readFile(pdfPath)),
          answerKey: keyPath ? new Uint8Array(await readFile(keyPath)) : null,
          sourceUrl: flag("fonte") ?? null,
          answerKeyUrl: flag("fonte-gabarito") ?? null,
        },
        null,
      );
      console.log(`Prova criada: ${paper.title}`);
      await extractUntilPaused([paper.id]);
      return;
    }
    case "importar": {
      if (!requireAi()) return;
      const file = positional[0] ?? "prisma/provas-oficiais.json";
      const only = flag("concurso");
      const entries = (JSON.parse(await readFile(file, "utf8")) as ManifestEntry[]).filter((e) => !only || e.concurso === only);
      const ids: string[] = [];
      const keys = new Map<string, Uint8Array>();
      for (const entry of entries) {
        const label = `${entry.concurso} ${entry.ano} — ${entry.versao}`;
        const cid = await competitionId(entry.concurso);
        const existing = await db.examPaper.findFirst({ where: { competitionId: cid, year: entry.ano, version: entry.versao }, select: { id: true, status: true } });
        if (existing) {
          if (!["PUBLISHED", "REVIEW"].includes(existing.status)) ids.push(existing.id);
          console.log(`= ${label} (já importada)`);
          continue;
        }
        try {
          console.log(`↓ ${label}`);
          const pdf = await fetchSource(entry.prova);
          let answerKey: Uint8Array | null = null;
          if (entry.gabarito) {
            answerKey = keys.get(entry.gabarito) ?? (await fetchSource(entry.gabarito));
            keys.set(entry.gabarito, answerKey);
          }
          const paper = await createExamPaper({ competitionId: cid, year: entry.ano, version: entry.versao, title: entry.titulo, pdf, answerKey, sourceUrl: entry.prova.split("#")[0]!, answerKeyUrl: entry.gabarito?.split("#")[0] ?? null }, null);
          ids.push(paper.id);
        } catch (err) {
          log(`⚠ ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await extractUntilPaused(ids);
      return;
    }
    case "continuar": {
      if (!requireAi()) return;
      // Also papers in review that still have unread questions (e.g. the official key showed more questions).
      const papers = (await db.examPaper.findMany({ where: { status: { in: ["UPLOADED", "EXTRACTING", "FAILED", "REVIEW"] } }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, extractedUpTo: true, expectedCount: true } })).filter(
        (p) => p.status !== "REVIEW" || (p.expectedCount !== null && p.extractedUpTo < p.expectedCount),
      );
      if (papers.length === 0) console.log("Nenhuma extração pendente.");
      await extractUntilPaused(papers.map((p) => p.id));
      return;
    }
    case "reverificar": {
      const papers = await db.examPaper.findMany({ where: { extractedUpTo: { gt: 0 } }, orderBy: { createdAt: "asc" }, select: { id: true, title: true } });
      for (const p of papers) {
        const before = await db.questionDraft.count({ where: { examPaperId: p.id, status: "PENDING", issues: { isEmpty: true } } });
        const result = await refreshPaper(p.id, log);
        const after = await db.questionDraft.count({ where: { examPaperId: p.id, status: "PENDING", issues: { isEmpty: true } } });
        console.log(`${result.ok ? "✓" : "⚠"} ${p.title}: ${result.ok ? `sem pendências ${before} → ${after}` : result.message}`);
      }
      return;
    }
    case "publicar": {
      const papers = (await db.examPaper.findMany({ where: { status: "REVIEW", leaseUntil: null }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, extractedUpTo: true, expectedCount: true } })).filter(
        (p) => p.expectedCount !== null && p.extractedUpTo >= p.expectedCount,
      );
      let total = 0;
      for (const p of papers) {
        const { published, failed } = await approveCleanDrafts({ examPaperId: p.id });
        const pending = await db.questionDraft.count({ where: { examPaperId: p.id, status: "PENDING" } });
        total += published;
        console.log(`${p.title}: ${published} publicada(s), ${pending} para revisar${failed.length ? `, ${failed.length} com erro: ${failed[0]}` : ""}`);
      }
      console.log(`
Total publicado agora: ${total}. Revise as demais em /admin/provas.`);
      return;
    }
    case "limpar": {
      const used = new Set<string>();
      for (const row of [...(await db.questionDraft.findMany({ select: { figures: true } })), ...(await db.question.findMany({ where: { figures: { not: Prisma.DbNull } }, select: { figures: true } }))]) {
        for (const f of (row.figures as { file?: string | null }[] | null) ?? []) if (f.file) used.add(f.file);
      }
      const papers = new Set((await db.examPaper.findMany({ select: { id: true } })).map((p) => p.id.toLowerCase()));
      let figures = 0;
      let pages = 0;
      for (const file of await listFiles("figuras")) {
        if (used.has(file)) continue;
        await removeFile("figuras", file);
        figures++;
      }
      for (const file of await listFiles("paginas")) {
        if (papers.has(file.replace(/-p\d+\.png$/, ""))) continue;
        await removeFile("paginas", file);
        pages++;
      }
      console.log(`Removidas ${figures} figura(s) e ${pages} página(s) sem uso.`);
      return;
    }
    case "situacao":
    case undefined: {
      const papers = await db.examPaper.findMany({ orderBy: [{ competition: { name: "asc" } }, { year: "desc" }], include: { competition: { select: { name: true } }, _count: { select: { drafts: true, questions: true } } } });
      if (papers.length === 0) console.log("Nenhuma prova importada ainda.");
      for (const p of papers) {
        const pending = await db.questionDraft.count({ where: { examPaperId: p.id, status: "PENDING" } });
        console.log(`${p.status.padEnd(10)} ${p.title} · lidas ${p.extractedUpTo}/${p.expectedCount ?? "?"} · a revisar ${pending} · publicadas ${p._count.questions} · pedidos à IA ${p.aiRequests}${p.statusNote ? `\n           ${p.statusNote}` : ""}`);
      }
      return;
    }
    default:
      throw new DomainError(`Comando desconhecido: ${command}. Veja o topo de scripts/provas.ts.`);
  }
}

main().then(
  () => end(0),
  (err) => {
    console.error(err instanceof DomainError ? err.message : err);
    end(1);
  },
);
