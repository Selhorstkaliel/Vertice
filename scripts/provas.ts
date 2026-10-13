/**
 * Banco de questões a partir de provas oficiais.
 *
 *   npm run provas -- admin <email>                     # dá acesso de administrador (revisão e publicação)
 *   npm run provas -- importar [arquivo.json]           # baixa e lê as provas listadas (padrão: prisma/provas-oficiais.json)
 *   npm run provas -- importar --concurso=efomm         # só as provas de um concurso da lista
 *   npm run provas -- importar --pasta=C:\Downloads     # usa PDFs/ZIPs já baixados nessa pasta (sites que só abrem no navegador)
 *   npm run provas -- arquivo <concurso> <ano> "<versão>" prova.pdf [gabarito.pdf] [--fonte=URL] [--fonte-gabarito=URL]
 *   npm run provas -- continuar [--prova=<id>]          # retoma extrações pausadas (limite diário) ou com falha
 *   npm run provas -- situacao                          # resumo por prova
 *   npm run provas -- reverificar                       # reaplica gabarito e conferências nas provas já lidas
 *   npm run provas -- paginas <id> [de] [ate]           # gera as imagens das páginas (leitura manual e conferência)
 *   npm run provas -- resolver [--prova=<id>]           # escreve as resoluções que faltam nas provas já lidas
 *   npm run provas -- transcrever <id> questoes.json    # grava uma transcrição feita fora da leitura automática
 *   npm run provas -- gabarito <id> gabarito.json       # grava um gabarito conferido à mão e o reaplica nas questões
 *   npm run provas -- textos [--prova=<id>]             # recupera os textos-base que a transcrição deixou de fora
 *   npm run provas -- disciplinas [--prova=<id>] [--ia] # classifica as questões sem disciplina (bloco do gabarito; --ia usa o enunciado)
 *   npm run provas -- publicar                          # publica as questões sem nenhuma pendência das provas lidas por completo
 *   npm run provas -- gerar [--concurso=efomm]          # gera questões no estilo das oficiais já publicadas
 *              [--quantidade=3] [--rodadas=2] [--publicar]
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
import { classifyDraftsByContent, fillMissingBaseTexts, recheckPaperDrafts, refreshPaper, runPaperExtraction, saveTranscribedQuestions, type TranscribedQuestion } from "@/modules/exam-papers/extract";
import { isPdf, listFiles, removeFile, storagePath } from "@/lib/storage";
import { approveCleanDrafts, createExamPaper, downloadFile } from "@/modules/exam-papers/service";
import { generateStyleQuestions, MAX_GENERATED_PER_RUN } from "@/modules/exam-papers/generate";
import { pageImageName, pdfPageCount, renderPage } from "@/modules/exam-papers/pdf";
import { missingBaseText } from "@/engines/questions/draft-check";
import { loadCompetitionCatalog, matchSubject } from "@/modules/exam-papers/catalog";
import { paperKey } from "@/modules/exam-papers/review-check";
import type { StoredAnswerKey } from "@/modules/exam-papers/review-check";

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
const has = (name: string) => rest.includes(`--${name}`);
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

/**
 * Gabarito conferido à mão. Algumas bancas publicam a folha de respostas com a
 * alternativa marcada por um círculo preenchido, e não por uma letra: aí a
 * leitura automática erra e só a conferência humana resolve.
 *
 * Aceita o formato guardado no banco ou um bloco enxuto:
 *   { "versao": "A", "secao": "GERAL", "de": 1,
 *     "respostas": "ANULADA C A ANULADA A A A E D ANULADA B …" }
 * Cada resposta é a letra da alternativa; "ANULADA", "ANUL" ou "X" marcam a
 * questão anulada.
 */
function readManualKey(raw: unknown): StoredAnswerKey {
  const blocks = Array.isArray(raw) ? raw : ((raw as { sections?: unknown[] }).sections ?? [raw]);
  const sections = (blocks as Record<string, unknown>[]).map((block) => {
    const version = String(block.version ?? block.versao ?? "");
    const section = String(block.section ?? block.secao ?? "");
    const first = Number(block.from ?? block.de ?? 1);
    const raw = block.answers ?? block.respostas;
    if (Array.isArray(raw) && typeof raw[0] === "object") {
      return { version, section, answers: raw as { number: number; label: string; annulled: boolean }[] };
    }
    const tokens = (Array.isArray(raw) ? (raw as string[]) : String(raw ?? "").split(/[\s,]+/)).filter(Boolean);
    const answers = tokens.map((token, i) => {
      const annulled = /^(anul|anulada|x|-)$/i.test(token);
      return { number: first + i, label: annulled ? "" : token.trim().toUpperCase().slice(0, 1), annulled };
    });
    return { version, section, answers };
  });
  const empty = sections.find((s) => s.answers.length === 0);
  if (empty) throw new DomainError("Há bloco de gabarito sem respostas.");
  const kind = (raw as { kind?: string }).kind;
  return { kind: kind === "PRELIMINAR" || kind === "DESCONHECIDO" ? kind : "DEFINITIVO", sections };
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
      const one = flag("prova");
      const papers = (await db.examPaper.findMany({ where: { status: { in: ["UPLOADED", "EXTRACTING", "FAILED", "REVIEW"] }, ...(one ? { id: one } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, extractedUpTo: true, expectedCount: true } })).filter(
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
    case "resolver": {
      if (!requireAi()) return;
      const one = flag("prova");
      // Provas já lidas cujos rascunhos ainda não têm resolução — o caso de uma transcrição manual.
      const semResolucao = await db.questionDraft.groupBy({
        by: ["examPaperId"],
        where: { status: "PENDING", explanation: null, ...(one ? { examPaperId: one } : {}) },
        _count: { _all: true },
      });
      const papers = await db.examPaper.findMany({
        where: { id: { in: semResolucao.map((g) => g.examPaperId).filter((id): id is string => Boolean(id)) }, status: { in: ["REVIEW", "EXTRACTING"] } },
        select: { id: true, title: true },
      });
      if (papers.length === 0) console.log("Nenhuma questão à espera de resolução.");
      await extractUntilPaused(papers.map((p) => p.id));
      return;
    }
    case "paginas": {
      const [paperId, fromArg, toArg] = positional;
      if (!paperId) throw new DomainError("Uso: npm run provas -- paginas <id da prova> [primeira] [última]");
      const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, select: { title: true, filePath: true } });
      const total = await pdfPageCount(paper.filePath);
      const from = Math.max(1, Number(fromArg ?? 1));
      const to = Math.min(Number(toArg ?? total), total);
      console.log(`${paper.title}: ${total} página(s). Gerando ${from} a ${to} em ${path.dirname(storagePath("paginas", pageImageName(paperId, from)))}`);
      for (let page = from; page <= to; page++) {
        await renderPage(paperId, paper.filePath, page);
        console.log(`  página ${page}: ${pageImageName(paperId, page)}`);
      }
      return;
    }
    case "transcrever": {
      const [paperId, file] = positional;
      if (!paperId || !file) throw new DomainError('Uso: npm run provas -- transcrever <id da prova> questoes.json [--modelo="quem transcreveu"]');
      const paper = await db.examPaper.findUniqueOrThrow({
        where: { id: paperId },
        select: { id: true, title: true, competitionId: true, filePath: true, version: true, layout: true, answerKey: true, extractedUpTo: true, expectedCount: true },
      });
      const questions = JSON.parse(await readFile(file, "utf8")) as TranscribedQuestion[];
      const saved = await saveTranscribedQuestions(paper, questions, flag("modelo") ?? "transcrição manual");
      const highest = Math.max(paper.extractedUpTo, ...questions.map((q) => q.number));
      const complete = paper.expectedCount !== null && highest >= paper.expectedCount;
      await db.examPaper.update({
        where: { id: paper.id },
        data: { extractedUpTo: highest, leaseUntil: null, ...(complete ? { status: "REVIEW", statusNote: null } : {}) },
      });
      console.log(`${paper.title}: ${saved} questão(ões) gravada(s); lidas até a ${highest}${complete ? " (prova completa, em revisão)" : ""}.`);
      console.log("Rode `npm run provas -- publicar` para publicar as que passarem nas conferências.");
      return;
    }
    case "disciplinas": {
      const only = flag("prova");
      const papers = await db.examPaper.findMany({
        where: { ...(only ? { id: only } : {}), status: { in: ["REVIEW", "PUBLISHED"] } },
        select: { id: true, title: true, competitionId: true, version: true, layout: true, answerKey: true, expectedCount: true },
        orderBy: { title: "asc" },
      });
      let total = 0;
      for (const paper of papers) {
        const drafts = await db.questionDraft.findMany({ where: { examPaperId: paper.id, subjectId: null, status: "PENDING" }, select: { id: true, number: true } });
        if (drafts.length === 0) continue;
        const catalog = await loadCompetitionCatalog(paper.competitionId);
        const { entries } = paperKey(paper);
        const layout = (paper.layout as { subject: string; from: number; to: number }[] | null) ?? [];
        let ok = 0;
        const semNome = new Set<string>();
        for (const d of drafts) {
          // O bloco do gabarito diz a disciplina de cada número; o mapa da prova é o reserva.
          const section =
            entries?.find((e) => e.number === d.number)?.section ||
            layout.find((s) => d.number !== null && d.number >= s.from && d.number <= s.to)?.subject;
          const subjectId = section ? matchSubject(catalog, section, section) : null;
          if (!subjectId) {
            if (section) semNome.add(section);
            continue;
          }
          await db.questionDraft.update({ where: { id: d.id }, data: { subjectId } });
          ok++;
        }
        // O bloco do gabarito não resolve quando a banca junta disciplinas num bloco só
        // ou nomeia o bloco pelo cargo: aí só o enunciado diz de que matéria é a questão.
        let porConteudo = 0;
        if (has("ia") && ok < drafts.length && requireAi()) {
          console.log(`${paper.title}: lendo o enunciado das que sobraram…`);
          porConteudo = await classifyDraftsByContent(paper.id, log);
        }
        if (ok || porConteudo) await recheckPaperDrafts(paper.id);
        total += ok + porConteudo;
        const falta = semNome.size && !porConteudo ? ` · sem disciplina no catálogo: ${[...semNome].join(", ")}` : "";
        const ia = porConteudo ? ` (${porConteudo} pelo enunciado)` : "";
        console.log(`${paper.title}: ${ok + porConteudo} de ${drafts.length} classificada(s)${ia}${falta}`);
      }
      console.log(`\nTotal classificado: ${total}.`);
      return;
    }
    case "textos": {
      if (!requireAi()) return;
      const only = flag("prova");
      const papers = await db.examPaper.findMany({
        where: { ...(only ? { id: only } : {}), status: { in: ["REVIEW", "PUBLISHED"] } },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      });
      let total = 0;
      for (const paper of papers) {
        if (availableModels().length === 0) {
          console.log("\nLimite diário da IA atingido em todos os modelos. Rode `npm run provas -- textos` amanhã.");
          break;
        }
        const pendentes = (
          await db.questionDraft.findMany({
            where: { examPaperId: paper.id, origin: "EXTRACTED", status: { in: ["PENDING", "APPROVED"] } },
            select: { statement: true },
          })
        ).filter((d) => missingBaseText(d.statement)).length;
        if (pendentes === 0) continue;
        console.log(`\n▶ ${paper.title}: ${pendentes} questão(ões) sem o texto-base`);
        const filled = await fillMissingBaseTexts(paper.id, log);
        await recheckPaperDrafts(paper.id);
        total += filled;
        console.log(`  ${filled} texto(s) recuperado(s).`);
      }
      console.log(`\nTotal recuperado: ${total}.`);
      return;
    }
    case "gabarito": {
      const [paperId, file] = positional;
      if (!paperId || !file) throw new DomainError("Uso: npm run provas -- gabarito <id da prova> gabarito.json");
      const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, select: { id: true, title: true } });
      const key = readManualKey(JSON.parse(await readFile(file, "utf8")));
      await db.examPaper.update({ where: { id: paper.id }, data: { answerKey: key as unknown as Prisma.InputJsonValue, leaseUntil: null } });
      const total = key.sections.reduce((n, s) => n + s.answers.length, 0);
      console.log(`${paper.title}: gabarito gravado com ${total} resposta(s) em ${key.sections.length} bloco(s). Reaplicando nas questões…`);
      const result = await refreshPaper(paper.id, (line) => console.log(`  ${line}`));
      console.log(`  ${result.message}`);
      return;
    }
    case "gerar": {
      if (!requireAi()) return;
      const only = flag("concurso");
      const perRun = Math.max(1, Math.min(MAX_GENERATED_PER_RUN, Number(flag("quantidade") ?? 3)));
      const rounds = Math.max(1, Number(flag("rodadas") ?? 1));

      // Só é possível gerar no estilo de uma prova que já tem questões oficiais publicadas na disciplina.
      const groups = await db.question.groupBy({
        by: ["competitionId", "subjectId"],
        where: { source: "OFFICIAL", ownerId: null, competitionId: only ? await competitionId(only) : { not: null } },
        _count: { _all: true },
      });
      if (groups.length === 0) throw new DomainError("Nenhuma questão oficial publicada ainda. Rode `npm run provas -- publicar` antes de gerar.");

      const names = new Map(
        (await db.competition.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name] as const),
      );
      const subjects = new Map((await db.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name] as const));

      let created = 0;
      for (const group of groups) {
        const competition = group.competitionId;
        if (!competition) continue;
        const label = `${names.get(competition) ?? competition} · ${subjects.get(group.subjectId) ?? group.subjectId}`;
        for (let round = 0; round < rounds; round++) {
          if (availableModels().length === 0) {
            console.log("\nLimite diário da IA atingido em todos os modelos. Rode `npm run provas -- gerar` amanhã.");
            round = rounds;
            break;
          }
          try {
            const result = await generateStyleQuestions({ competitionId: competition, subjectId: group.subjectId, topicId: null, count: perRun, difficulty: null });
            created += result.created;
            console.log(`✓ ${label}: ${result.created} rascunho(s) gerado(s) (${group._count._all} oficiais como referência)`);
          } catch (err) {
            console.log(`⚠ ${label}: ${err instanceof Error ? err.message : String(err)}`);
            break;
          }
        }
      }

      console.log(`\nTotal gerado: ${created} rascunho(s). Revise em /admin/geradas.`);
      if (has("publicar")) {
        const { published, failed } = await approveCleanDrafts({ origin: "GENERATED" });
        console.log(`Publicadas sem pendências: ${published}${failed.length ? `, ${failed.length} com erro: ${failed[0]}` : ""}.`);
      }
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
