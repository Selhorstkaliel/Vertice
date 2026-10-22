/**
 * npm run test:editais — end-to-end test of the automatic edital search,
 * without touching real sites. A stand-in official site publishes an edital
 * and then a retificação; a stand-in Gemini answers the reading. The test
 * drives detection, notice with the official link, download, classification,
 * reading, automatic checks, review, publication, the retificação change list
 * and a broken source. Everything it creates is removed at the end.
 * Needs the Docker database (npm run db:up) and the catalog seed.
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

/* ── stand-in official site ───────────────────────────────────────── */

/** Minimal valid PDF, one page per entry, plain Helvetica text (enough for pdf.js text extraction). */
function makePdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let next = 4;
  for (const lines of pages) {
    const stream = `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) '`).join(" ")} ET`;
    const contentId = next++;
    const pageId = next++;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const EDITAL = makePdf([
  ["EDITAL DE ABERTURA DO CONCURSO DE TESTE 2027", "Banca organizadora: Fundacao de Teste.", "Cargo: Aluno, 100 vagas."],
  ["CRONOGRAMA", "Inscricoes de 10/11/2026 a 20/11/2026.", "Prova objetiva em 10/05/2027.", "Recursos ate 15/05/2027.", "Inspecao de saude de 01/06/2027 a 05/06/2027."],
  ["DA PROVA", "Matematica: 20 questoes, peso 2.", "Portugues: 20 questoes, peso 1.", "Total de 40 questoes.", "Cada questao errada anula uma questao certa."],
  ["TESTE DE APTIDAO FISICA", "Corrida de 12 minutos: masculino 2.400 metros, feminino 2.000 metros.", "Flexao de bracos: masculino 20 repeticoes, feminino 10 repeticoes."],
]);
const RETIFICACAO = makePdf([["1a RETIFICACAO DO EDITAL DO CONCURSO DE TESTE 2027", "Onde se le prova objetiva em 10/05/2027,", "leia-se prova objetiva em 17/05/2027."]]);

const site = { files: new Map<string, Buffer>(), links: [] as { href: string; text: string }[], broken: false };
site.files.set("/arquivos/resultado-2025.pdf", makePdf([["Resultado final 2025"]]));
site.links.push({ href: "/arquivos/resultado-2025.pdf", text: "Resultado final do concurso 2025" });

const siteServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /privado/");
  if (url.pathname === "/concursos") {
    if (site.broken) return res.writeHead(200, { "content-type": "text/html" }).end("<html><body>Manutenção</body></html>");
    return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<html><body><a href="/">Início</a>${site.links.map((l) => `<a href="${l.href}">${l.text}</a>`).join("")}</body></html>`);
  }
  const f = site.files.get(url.pathname);
  if (f) return res.writeHead(200, { "content-type": "application/pdf" }).end(f);
  res.writeHead(404).end();
});

/* ── stand-in Gemini ──────────────────────────────────────────────── */

let geminiCalls = 0;
const geminiServer = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  geminiCalls++;
  const body = JSON.parse(raw || "{}") as { contents?: { parts?: { text?: string }[] }[] };
  const prompt = (body.contents?.[0]?.parts ?? []).map((p) => p.text ?? "").join("\n");
  const retificacao = /RETIFICACAO/.test(prompt);
  const answer = (() => {
    if (prompt.startsWith("Banca organizadora")) return { banca: { nome: "Fundacao de Teste", pagina: 1, trecho: "Banca organizadora: Fundacao de Teste." }, cargos: [{ nome: "Aluno", vagas: 100, pagina: 1, trecho: "Cargo: Aluno, 100 vagas." }] };
    if (prompt.startsWith("Todas as datas")) {
      return retificacao
        ? { datas: [{ chave: "prova_objetiva", rotulo: "Prova", data: "2027-05-17", pagina: 1, trecho: "leia-se prova objetiva em 17/05/2027." }] }
        : {
            datas: [
              { chave: "inscricao_inicio", rotulo: "Início", data: "2026-11-10", pagina: 2, trecho: "Inscricoes de 10/11/2026" },
              { chave: "inscricao_fim", rotulo: "Fim", data: "2026-11-20", pagina: 2, trecho: "a 20/11/2026" },
              { chave: "prova_objetiva", rotulo: "Prova", data: "2027-05-10", pagina: 2, trecho: "Prova objetiva em 10/05/2027." },
              { chave: "recurso_fim", rotulo: "Recursos", data: "2027-05-15", pagina: 2, trecho: "Recursos ate 15/05/2027." },
              // Invented by the "AI": not in the PDF, must become an issue.
              { chave: "resultado_final", rotulo: "Resultado", data: "2027-06-30", pagina: 2, trecho: "Resultado final em 30/06/2027." },
            ],
          };
    }
    if (prompt.startsWith("As disciplinas")) {
      return retificacao
        ? { disciplinas: [], dias: [], pontuacao: null }
        : {
            disciplinas: [
              { nome: "Matemática", questoes: 20, peso: 2, notaMinima: null, dia: null, pagina: 3, trecho: "Matematica: 20 questoes, peso 2." },
              { nome: "Língua Portuguesa", questoes: 20, peso: 1, notaMinima: null, dia: null, pagina: 3, trecho: "Portugues: 20 questoes, peso 1." },
            ],
            dias: [],
            pontuacao: { modo: "DESCONTO", descontoPorErro: 1, notaMinimaTotal: null, notaMaxima: null, pagina: 3, trecho: "Cada questao errada anula uma questao certa." },
          };
    }
    if (prompt.startsWith("As etapas")) {
      return retificacao
        ? { etapas: [] }
        : { etapas: [{ nome: "Inspeção de saúde", ordem: 3, eliminatoria: true, descricao: "Exames médicos.", cronograma: [{ evento: "Inspeção de saúde", inicio: "2027-06-01", fim: "2027-06-05" }], pagina: 2, trecho: "Inspecao de saude de 01/06/2027 a 05/06/2027." }] };
    }
    if (prompt.startsWith("O conteúdo")) return { conteudo: [] };
    if (prompt.startsWith("Os critérios")) return { redacao: null };
    if (prompt.startsWith("Os índices")) {
      const t = (prova: string, sexo: string, indice: string, unidade: string) => ({ prova, sexo, faixaEtaria: null, indice, unidade, pagina: 4, trecho: "Corrida de 12 minutos: masculino 2.400 metros" });
      return retificacao
        ? { taf: [] }
        : { taf: [t("Corrida de 12 minutos", "MASCULINO", "2.400", "metros"), t("Corrida de 12 minutos", "FEMININO", "2.000", "metros"), t("Flexão de braços", "MASCULINO", "20", "repetições"), t("Flexão de braços", "FEMININO", "10", "repetições")] };
    }
    if (prompt.startsWith("Documentos exigidos")) return { documentos: [] };
    return { tipo: retificacao ? "RETIFICACAO" : "EDITAL" };
  })();
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 80 }, modelVersion: "gemini-mock" }));
});

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));
const sitePort = await listen(siteServer);
const geminiPort = await listen(geminiServer);

// The app reads its configuration when first imported: set it before loading any module.
Object.assign(process.env, {
  GEMINI_API_KEY: "mock-gemini-key",
  GEMINI_BASE_URL: `http://127.0.0.1:${geminiPort}`,
  EDITAL_AI_MODELS: "gemini-mock",
  EDITAIS_ALLOW_LOCAL_SOURCES: "on",
  // The personal ChatGPT plan would take priority over the mocked Gemini.
  CHATGPT_PERSONAL_MODE: "off",
  NODE_ENV: "test",
});
const { db } = await import("@/lib/db");
const { checkSource } = await import("@/modules/editais/verify");
const { readPending } = await import("@/modules/editais/read");
const { reviewField, reviewChange, publishDocument } = await import("@/modules/editais/review");
const { parseFields } = await import("@/modules/editais/published");
const { removeFile } = await import("@/lib/storage");
const { syncStageItems } = await import("@/modules/military/stages");
const { syncTafFromEdital } = await import("@/modules/military/service");

/* ── checks ───────────────────────────────────────────────────────── */

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "OK   " : "FALHA"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
};
const log = () => undefined;
const BASE = `http://127.0.0.1:${sitePort}`;
const tag = randomBytes(4).toString("hex");

const subjects = await db.subject.findMany({ where: { ownerId: null, slug: { in: ["matematica", "portugues"] } }, select: { id: true, slug: true } });
const competition = await db.competition.create({
  data: {
    slug: `e2e-editais-${tag}`,
    name: `Concurso de teste ${tag}`,
    organization: "Teste",
    kind: "MILITARY",
    subjects: { create: subjects.map((s, order) => ({ subjectId: s.id, order })) },
    stages: { create: [{ name: "Inscrição", order: 1 }, { name: "Prova objetiva", order: 2 }, { name: "Inspeção de saúde", order: 3 }] },
  },
});
const admin = await db.user.create({ data: { email: `admin-${tag}@e2e.test`, passwordHash: "x", name: "Admin E2E", isAdmin: true } });
const student = await db.user.create({ data: { email: `aluno-${tag}@e2e.test`, passwordHash: "x", name: "Aluno E2E", onboardedAt: new Date(), profile: { create: {} } } });
const enrollment = await db.studentCompetition.create({
  data: { userId: student.id, competitionId: competition.id, isPrimary: true, customExamDate: new Date("2027-06-01T00:00:00Z"), stages: { create: [{ name: "Prova objetiva", order: 1 }, { name: "Inspeção de saúde", order: 2 }] } },
});
const source = await db.editalSource.create({ data: { competitionId: competition.id, url: `${BASE}/concursos`, kind: "LINK_LIST" } });
const notices = () => db.notification.findMany({ where: { userId: student.id }, orderBy: { createdAt: "asc" } });

try {
  // 1. First check: what already exists is history, nobody is notified.
  const first = await checkSource(source.id, log, { force: true });
  check("first check registers existing documents as history", first?.baseline === true && first.found === 1);
  check("history does not notify students", (await notices()).length === 0);

  // 2. The site publishes an edital: notice right away with the official link only.
  site.files.set("/arquivos/edital-2027.pdf", EDITAL);
  site.links.push({ href: "/arquivos/edital-2027.pdf", text: "Edital de abertura do concurso 2027" });
  const second = await checkSource(source.id, log, { force: true });
  check("new edital detected", second?.new === 1);
  const edital = await db.editalDocument.findFirstOrThrow({ where: { competitionId: competition.id, url: `${BASE}/arquivos/edital-2027.pdf` } });
  check("classified by rules as EDITAL", edital.type === "EDITAL" && edital.typedBy === "regras");
  check("PDF downloaded and stored by hash", !!edital.fileHash && edital.filePath === `${edital.fileHash}.pdf`);
  const n1 = await notices();
  check("student notified with the official link, no interpreted data", n1.length === 1 && n1[0]!.type === "EDITAL_DOCUMENT" && n1[0]!.href === edital.url && /conferência/.test(n1[0]!.body ?? ""));
  await checkSource(source.id, log, { force: true });
  check("a repeated check does not duplicate documents or notices", (await db.editalDocument.count({ where: { competitionId: competition.id } })) === 2 && (await notices()).length === 1);

  // 3. AI reading (stand-in), automatic checks.
  const before = geminiCalls;
  await readPending(log, { documentId: edital.id });
  const read = await db.editalDocument.findUniqueOrThrow({ where: { id: edital.id }, include: { extraction: true } });
  check("edital read and sent to review", read.status === "REVIEW" && !!read.extraction, read.statusNote ?? "");
  check("reading registered AI usage", (await db.aiUsage.count({ where: { refId: edital.id, feature: "EDITAL_READING" } })) === geminiCalls - before);
  const fields = parseFields(read.extraction?.fields);
  check("each field carries page and passage", fields["data:prova_objetiva"]?.page === 2 && !!fields["data:prova_objetiva"]?.quote);
  check("date invented by the AI becomes an issue", (fields["data:resultado_final"]?.issues ?? []).some((i) => /não aparece/.test(i)));
  check("dates printed in the PDF pass", (fields["data:prova_objetiva"]?.issues ?? []).length === 0, JSON.stringify(fields["data:prova_objetiva"]?.issues));
  check("nothing reached the competition before review", (await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).verification === "UNVERIFIED");

  // 4. Review: reject the invented date, approve the rest, publish.
  let blocked = false;
  try {
    await publishDocument(edital.id, admin.id);
  } catch {
    blocked = true;
  }
  check("publication refused while items are pending", blocked);
  for (const key of Object.keys(fields)) await reviewField(edital.id, key, { status: key === "data:resultado_final" ? "REJECTED" : "APPROVED" }, admin.id);
  const pub = await publishDocument(edital.id, admin.id);
  const c1 = await db.competition.findUniqueOrThrow({ where: { id: competition.id }, include: { subjects: { include: { subject: true } } } });
  check("exam date applied and competition verified", c1.examDate?.toISOString().slice(0, 10) === "2027-05-10" && c1.verification === "VERIFIED" && c1.editalUrl === edital.url);
  check("subject weights and question counts applied", c1.subjects.find((s) => s.subject.slug === "matematica")?.weight === 2 && c1.subjects.find((s) => s.subject.slug === "matematica")?.questionCount === 20);
  check("scoring rule with penalty created and verified", !!(await db.scoringRule.findFirst({ where: { competitionId: competition.id, mode: "PENALTY", wrongPenalty: 1, verification: "VERIFIED" } })));
  check("deadline item created from the edital", !!(await db.competitionStageItem.findFirst({ where: { stage: { competitionId: competition.id }, title: "Fim das inscrições", verification: "VERIFIED" } })));
  check("rejected field not applied", pub.applied === Object.keys(fields).length - 1);
  const e1 = await db.studentCompetition.findUniqueOrThrow({ where: { id: enrollment.id } });
  check("student's own exam date kept, and they are asked", e1.keepCustomExamDate && e1.customExamDate?.toISOString().slice(0, 10) === "2027-06-01");
  const health = await db.competitionStage.findFirstOrThrow({ where: { competitionId: competition.id, name: "Inspeção de saúde" } });
  check("stage dates come from its cronograma", health.startDate?.toISOString().slice(0, 10) === "2027-06-01" && health.endDate?.toISOString().slice(0, 10) === "2027-06-05");
  const studentHealth = await db.studentStage.findFirstOrThrow({ where: { studentCompetitionId: enrollment.id, name: "Inspeção de saúde" } });
  check("student's stage gets the edital date", studentHealth.date?.toISOString().slice(0, 10) === "2027-06-01" && studentHealth.dateFromCatalog);
  await db.studentStage.update({ where: { id: studentHealth.id }, data: { date: new Date("2027-06-03T00:00:00Z"), dateFromCatalog: false } });
  await syncStageItems(student.id);
  check("a date the student set is never replaced", (await db.studentStage.findUniqueOrThrow({ where: { id: studentHealth.id } })).date?.toISOString().slice(0, 10) === "2027-06-03");
  const standards = await db.competitionTafStandard.findMany({ where: { competitionId: competition.id } });
  const run = standards.find((x) => x.sex === "MALE" && /Corrida/.test(x.test));
  check("TAF indices stored per sex and interpreted", standards.length === 4 && run?.unit === "METERS" && run.target === 2400 && run.betterWhen === "HIGHER");
  check("TAF waits for the student's sex", (await syncTafFromEdital(student.id, null)) === 0);
  const createdTests = await syncTafFromEdital(student.id, "FEMALE");
  const tests = await db.militaryTest.findMany({ where: { userId: student.id }, orderBy: { name: "asc" } });
  check("TAF filled with the edital targets for the student's sex", createdTests === 2 && tests.map((x) => `${x.name}=${x.targetValue}`).join(",") === "Corrida de 12 minutos=2000,Flexão de braços=10", tests.map((x) => `${x.name}=${x.targetValue}`).join(","));
  check("TAF fill is not duplicated", (await syncTafFromEdital(student.id, "FEMALE")) === 0);
  const n2 = await notices();
  check("update notice and official-date question sent", n2.some((n) => n.type === "EDITAL_UPDATE" && /atualizados/.test(n.title)) && n2.some((n) => /Data oficial da prova publicada/.test(n.title)));

  // 5. The site publishes a retificação: the change list goes to review.
  site.files.set("/arquivos/retificacao-1.pdf", RETIFICACAO);
  site.links.push({ href: "/arquivos/retificacao-1.pdf", text: "1ª Retificação do Edital" });
  await checkSource(source.id, log, { force: true });
  const ret = await db.editalDocument.findFirstOrThrow({ where: { competitionId: competition.id, url: `${BASE}/arquivos/retificacao-1.pdf` } });
  check("retificação classified", ret.type === "RETIFICACAO");
  await readPending(log, { documentId: ret.id });
  const changes = await db.editalChange.findMany({ where: { documentId: ret.id } });
  const examChange = changes.find((ch) => ch.field === "data:prova_objetiva");
  check("change list shows exam date before → after", examChange?.before === "2027-05-10" && examChange?.after === "2027-05-17", JSON.stringify(changes.map((ch) => [ch.field, ch.before, ch.after])));
  for (const ch of changes) await reviewChange(ch.id, ch.field === "data:prova_objetiva" ? "APPROVED" : "REJECTED");
  for (const key of Object.keys(parseFields((await db.editalExtraction.findUniqueOrThrow({ where: { documentId: ret.id } })).fields))) await reviewField(ret.id, key, { status: "APPROVED" }, admin.id);
  const pub2 = await publishDocument(ret.id, admin.id);
  const c2 = await db.competition.findUniqueOrThrow({ where: { id: competition.id } });
  check("retificação moved the exam date", c2.examDate?.toISOString().slice(0, 10) === "2027-05-17");
  check("highlighted before → after for students", pub2.dateChanges.some((d) => /10\/05\/2027 → 17\/05\/2027/.test(d)) && (await notices()).some((n) => /10\/05\/2027 → 17\/05\/2027/.test(n.body ?? "")));
  const stage = await db.studentStage.findFirstOrThrow({ where: { studentCompetitionId: enrollment.id, name: "Prova objetiva" } });
  check("exam stage follows the official date", stage.date?.toISOString().slice(0, 10) === "2027-05-17");

  // 6. A broken source does not fail silently.
  site.broken = true;
  const broken = await checkSource(source.id, log, { force: true });
  const s = await db.editalSource.findUniqueOrThrow({ where: { id: source.id } });
  check("page without links where there were links is an error", !!broken?.error && s.consecutiveFailures === 1 && !!s.lastError);
} catch (err) {
  failures++;
  console.error("FALHA  erro inesperado", err);
} finally {
  const docs = await db.editalDocument.findMany({ where: { competitionId: competition.id }, select: { filePath: true } });
  for (const d of docs) if (d.filePath) await removeFile("editais", d.filePath).catch(() => undefined);
  await db.aiUsage.deleteMany({ where: { refId: { in: (await db.editalDocument.findMany({ where: { competitionId: competition.id }, select: { id: true } })).map((d) => d.id) } } });
  await db.competition.delete({ where: { id: competition.id } });
  await db.user.deleteMany({ where: { id: { in: [admin.id, student.id] } } });
  await db.$disconnect();
  siteServer.close();
  geminiServer.close();
}
console.log(failures ? `\n${failures} falhas.` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
