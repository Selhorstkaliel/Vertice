// Official-exam question bank through the running app (port 3100), with mock-gemini-native.mjs on :4030.
// Run with: npm run test:provas (see run-exam-bank.mjs). Needs the Docker database and the demo seed.
// Everything it creates (a throwaway competition, two accounts, papers, questions) is removed at the end.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";

const [SP, ROOT] = process.argv.slice(2); // SP: folder for logs
const BASE = "http://localhost:3100";
const env = Object.fromEntries(readFileSync(`${ROOT}/.env`, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const manifest = JSON.parse(readFileSync(`${ROOT}/.next/server/server-reference-manifest.json`, "utf8")).node;
const actionId = (name) => {
  const id = Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
  if (!id) throw new Error(`action not found: ${name}`);
  return id;
};
const sql = (q) => execSync(`docker exec vertice-postgres psql -U vertice -d vertice -At -F "|" -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Idle keep-alive sockets are closed by the server after 5 s; retry once on a reset.
const http = async (url, init) => {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err?.cause?.code !== "ECONNRESET") throw err;
    return fetch(url, init);
  }
};

let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra !== "" ? `  (${String(extra).slice(0, 240)})` : ""}`);
  if (!cond) failures++;
};

function sessionFor(email) {
  const userId = sql(`select id from "User" where email='${email}'`);
  const token = randomBytes(32).toString("base64url");
  sql(`insert into "Session" (id, "userId", "tokenHash", "expiresAt") values ('eb_${randomBytes(6).toString("hex")}', '${userId}', '${createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex")}', now() + interval '1 hour')`);
  return { userId, cookie: `__Host-vertice_session=${token}` };
}
async function action(s, name, args, path = "/admin/provas") {
  const r = await http(BASE + path, { method: "POST", redirect: "manual", headers: { cookie: s.cookie, origin: BASE, "Next-Action": actionId(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body: JSON.stringify(args) });
  const text = await r.text();
  const line = text.split("\n").find((l) => l.startsWith("1:"));
  return { status: r.status, value: line ? JSON.parse(line.slice(2)) : null, raw: text.slice(0, 300) };
}
async function page(s, path) {
  const r = await http(BASE + path, { headers: s ? { cookie: s.cookie } : {}, redirect: "manual" });
  return { status: r.status, body: await r.text(), type: r.headers.get("content-type") };
}

/** Minimal valid PDF, one text page per entry (ASCII). */
function makePdf(pages) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  pages.forEach((lines, i) => {
    const content = `BT /F1 9 Tf 12 TL 30 800 Td ${lines.map((l) => `(${esc(l)}) '`).join(" ")} ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const contentId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(objects.length);
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
const questionText = (q) =>
  q === 3
    ? "Observe a figura e determine a area do triangulo destacado em centimetros quadrados."
    : q === 9
      ? "Uma loja vende uma camisa por R$ 150,00 e sabe que x2 = 49. Qual o valor positivo de x?"
      : q === 12
        ? "O determinante da matriz vale segundo o enunciado original da questao doze."
        : `Questao numero ${q} da prova simulada: calcule o valor pedido com cuidado e marque a alternativa.`;
const examPdf = (marker) =>
  makePdf([
    [`PROVA SIMULADA ${marker}`, ...Array.from({ length: 20 }, (_, i) => i + 1).filter((q) => q !== 3).flatMap((q) => [`${q}a Questao`, questionText(q), ["A", "B", "C", "D", "E"].map((l, j) => `(${l}) ${q * 10 + j}`).join(" ")])],
    ["3a Questao", questionText(3), "(A) 30 (B) 31 (C) 32 (D) 33 (E) 34", "[desenho do triangulo]"],
  ]);
const keyPdf = makePdf([["GABARITO DEFINITIVO", "BRANCA", "MATEMATICA 1 B 2 C 3 D", "FISICA 13 D"]]);

async function importPaper(s, { version, pdf, key, origin = BASE, pdfUrl }) {
  const form = new FormData();
  const competitionId = sql(`select id from "Competition" where slug='teste-e2e' and "ownerId" is null`);
  form.set("competitionId", competitionId);
  form.set("year", "2025");
  form.set("version", version);
  if (pdf) form.set("pdf", new Blob([pdf], { type: "application/pdf" }), "prova.pdf");
  if (pdfUrl) form.set("pdfUrl", pdfUrl);
  if (key) form.set("answerKey", new Blob([key], { type: "application/pdf" }), "gabarito.pdf");
  const r = await http(`${BASE}/api/admin/provas`, { method: "POST", headers: { cookie: s.cookie, ...(origin ? { origin } : {}) }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function waitFor(paperId, statuses, seconds = 90) {
  for (let i = 0; i < seconds; i++) {
    const status = sql(`select status || '|' || coalesce("leaseUntil"::text,'') from "ExamPaper" where id='${paperId}'`);
    const [st, lease] = status.split("|");
    if (statuses.includes(st) && !lease) return st;
    await sleep(1000);
  }
  return sql(`select status from "ExamPaper" where id='${paperId}'`);
}

/* ── setup ───────────────────────────────────────────────────────── */
const ADMIN_EMAIL = "e2e-admin@vertice.test";
const STUDENT_EMAIL = "e2e-aluno@vertice.test";
function removeTestData() {
  const id = sql(`select id from "Competition" where slug='teste-e2e'`);
  if (id) {
    sql(`delete from "Question" where "competitionId"='${id}'`);
    sql(`delete from "QuestionDraft" where "competitionId"='${id}'`);
    sql(`delete from "ExamPaper" where "competitionId"='${id}'`);
    sql(`delete from "Competition" where id='${id}'`);
  }
  sql(`delete from "User" where email in ('${ADMIN_EMAIL}', '${STUDENT_EMAIL}')`);
}
/** Onboarded account cloned from the demo account profile (the profile shape stays in sync with the schema). */
function createAccount(email, isAdmin) {
  const demo = sql(`select id from "User" where email='demo@vertice.app'`);
  if (!demo) throw new Error("Rode npm run db:seed:demo antes deste teste.");
  const id = `e2e${randomBytes(8).toString("hex")}`;
  sql(`insert into "User" (id, email, "passwordHash", name, "isAdmin", "isDemo", "onboardedAt", "updatedAt") values ('${id}', '${email}', '!sem-login', 'Teste E2E', ${isAdmin}, false, now(), now())`);
  sql(`insert into "Profile" select (jsonb_populate_record(null::"Profile", to_jsonb(p) || jsonb_build_object('id', '${id}p', 'userId', '${id}'))).* from "Profile" p where p."userId"='${demo}'`);
}
removeTestData();
// Clean up even when a check throws halfway.
process.on("exit", () => {
  try {
    removeTestData();
  } catch {}
});
sql(`insert into "Competition" (id, slug, name, organization, kind, "updatedAt") values ('e2ecompetition', 'teste-e2e', 'E2E', 'Teste automatizado', 'MILITARY', now())`);
for (const [order, slug] of ["matematica", "fisica"].entries()) {
  sql(`insert into "CompetitionSubject" (id, "competitionId", "subjectId", "order") select 'e2ecs${order}', 'e2ecompetition', id, ${order} from "Subject" where slug='${slug}' and "ownerId" is null`);
}
const testCompetition = "e2ecompetition";
createAccount(ADMIN_EMAIL, true);
createAccount(STUDENT_EMAIL, false);
sql(`delete from "RateLimitCounter"`);
const admin = sessionFor(ADMIN_EMAIL);
const student = sessionFor(STUDENT_EMAIL);
const mockLog = `${SP}/gemini-native-requests.jsonl`;
// The runner probes the mock with GET / before starting; that is not an API call.
const mockRequests = () =>
  readFileSync(mockLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.path !== "/");

/* ── access control ─────────────────────────────────────────────── */
for (const p of ["/admin/provas", "/admin/geradas"]) {
  const r = await page(student, p);
  // With loading.tsx the status is already streamed; what matters is that nothing of the admin area renders.
  check(`students get the not-found page on ${p}`, [200, 404].includes(r.status) && r.body.includes("Página não encontrada") && !r.body.includes("Importar prova") && !r.body.includes("Gerar no estilo"));
}
check("admin area requires a session", (await page(null, "/admin/provas")).status === 307);
check("students cannot import", (await importPaper(student, { version: "Prova branca", pdf: examPdf("X"), key: keyPdf })).status === 404);
check("import requires a same-origin request", (await importPaper(admin, { version: "Prova branca", pdf: examPdf("X"), key: keyPdf, origin: "https://evil.example" })).status === 403);
const internal = await importPaper(admin, { version: "Prova branca", pdfUrl: "http://127.0.0.1:3100/entrar" });
check("importing from an internal address is refused", internal.status === 400 && /rede interna/.test(internal.json?.error), internal.json?.error);
const notPdf = await importPaper(admin, { version: "Prova branca", pdf: Buffer.from("hello, not a pdf"), key: keyPdf });
check("a file that is not a PDF is refused", notPdf.status === 400 && /não é um PDF/.test(notPdf.json?.error), notPdf.json?.error);
const missing = await importPaper(admin, { version: "", pdf: null });
check("missing fields are reported per field", missing.status === 400 && missing.json?.fieldErrors?.version && missing.json?.fieldErrors?.pdf === undefined, JSON.stringify(missing.json));

/* ── import and extraction ──────────────────────────────────────── */
const exam = examPdf("A");
const imported = await importPaper(admin, { version: "Prova branca", pdf: exam, key: keyPdf });
check("admin imports an exam with its key and reading starts", imported.status === 201 && imported.json?.started === true, JSON.stringify(imported.json));
const paperId = imported.json.id;
const running = await page(admin, `/admin/provas/${paperId}`);
check("review page shows the reading in progress (or already finished)", running.status === 200 && (running.body.includes("Lendo a prova") || running.body.includes("Em revisão")));
const finalStatus = await waitFor(paperId, ["REVIEW", "FAILED", "EXTRACTING"]);
check("reading finishes and the paper waits for review", finalStatus === "REVIEW", `${finalStatus}: ${sql(`select "statusNote" from "ExamPaper" where id='${paperId}'`)}`);
check("duplicate import is refused", /já foi importada/.test((await importPaper(admin, { version: "Outra versão", pdf: exam, key: keyPdf })).json?.error ?? ""));

const paper = sql(`select "expectedCount" || '|' || "extractedUpTo" || '|' || jsonb_array_length(layout) || '|' || "aiRequests" from "ExamPaper" where id='${paperId}'`);
check("paper layout and count come from the first batch", paper.startsWith("20|20|2|"), paper);
const draft = (q) => {
  const row = sql(`select id, status, coalesce("correctLabel",''), array_to_string(issues, ' || '), coalesce(explanation,''), coalesce(figures::text,''), coalesce(verification::text,''), coalesce("subjectId",'') from "QuestionDraft" where "examPaperId"='${paperId}' and number=${q}`);
  const [id, status, label, issues, explanation, figures, verification, subjectId] = row.split("|");
  return { id, status, label, issues, explanation, figures: figures ? JSON.parse(figures) : [], verification: verification ? JSON.parse(verification) : {}, subjectId };
};
check("all 20 questions became drafts", sql(`select count(*) from "QuestionDraft" where "examPaperId"='${paperId}'`) === "20");
check("answer comes from the official key", draft(1).label === "B" && draft(20).label === "E", `${draft(1).label} ${draft(20).label}`);
check("changed answers use the final letter", draft(7).label === "C", draft(7).label);
check("annulled questions are set aside automatically", draft(5).status === "REJECTED" && /anulada/.test(draft(5).issues), draft(5).issues);
check("the other version's key block is ignored", draft(1).label !== "E");
const d3 = draft(3);
check("figure cropped from the right page and flagged for a look", d3.figures.length === 1 && d3.figures[0].page === 2 && existsSync(`${ROOT}/storage/figuras/${d3.figures[0].file}`) && /Confira o recorte/.test(d3.issues), JSON.stringify(d3.figures));
check("options normalized to plain letters", sql(`select options->0->>'label' from "QuestionDraft" where id='${draft(1).id}'`) === "A");
check("subject classified from the catalog", draft(1).subjectId === sql(`select id from "Subject" where slug='matematica' and "ownerId" is null`) && draft(15).subjectId === sql(`select id from "Subject" where slug='fisica' and "ownerId" is null`));
check("numbers missing from the PDF text are flagged", /1176/.test(draft(12).issues), draft(12).issues);
const d10 = draft(10);
check("independent solution that disagrees triggers an explanation from the key", d10.verification.aiAnswer === "A" && d10.verification.explainedFromKey?.answer === "E" && /refeita a partir do gabarito \(E\)/.test(d10.issues) && d10.explanation.includes("alternativa E"), d10.issues);
check("agreeing solutions leave no issue", draft(9).issues === "" && draft(9).explanation.includes("Resolução da Q9"), draft(9).issues);

const reqs = mockRequests();
const generate = reqs.filter((r) => r.model);
const extraction = generate.filter((r) => /Transcreva as questões/.test(r.text));
const solving = generate.filter((r) => /Resolva cada questão|gabarito oficial de cada questão/.test(r.text));
check("exam and key uploaded with the API key header", reqs.filter((r) => r.path === "/upload/v1beta/files").length === 2 && reqs.every((r) => r.path.startsWith("/upload-session") || r.key === "mock-gemini-key"));
check("extraction: PDF by file reference, deterministic, schema enforced, two batches", extraction.length === 2 && extraction.every((r) => r.fileUris.length === 1 && r.generationConfig.temperature === 0 && r.generationConfig.responseSchema) && extraction[0].generationConfig.responseSchema.required.includes("paper"), extraction.map((r) => r.text.slice(0, 40)).join(" / "));
check("solving uses high reasoning and no forced temperature", solving.length >= 3 && solving.every((r) => r.generationConfig.thinkingConfig?.thinkingLevel === "high" && r.generationConfig.temperature === undefined), solving.length);
check("no student data sent to the AI", !JSON.stringify(reqs).includes(STUDENT_EMAIL) && !JSON.stringify(reqs).includes(ADMIN_EMAIL));

/* ── review page ─────────────────────────────────────────────────── */
const review = await page(admin, `/admin/provas/${paperId}?filtro=com-problemas`);
check("review page lists drafts with issues", review.status === 200 && review.body.includes("Questão 10") && review.body.includes("Confira o recorte"));
const opened = await page(admin, `/admin/provas/${paperId}?questao=9`);
check("a question can be opened by link, with the student preview", opened.body.includes("Como o aluno verá") && opened.body.includes("katex"));
check("rendered page image for the crop editor", (await http(`${BASE}/api/admin/provas/${paperId}/paginas/2`, { headers: { cookie: admin.cookie } })).headers.get("content-type") === "image/png");
check("page images are admin-only", (await http(`${BASE}/api/admin/provas/${paperId}/paginas/2`, { headers: { cookie: student.cookie } })).status === 404);

/* ── publishing ──────────────────────────────────────────────────── */
const content = (d) => ({
  statement: sql(`select statement from "QuestionDraft" where id='${d.id}'`),
  options: JSON.parse(sql(`select options::text from "QuestionDraft" where id='${d.id}'`)),
  correctLabel: d.label || null,
  explanation: d.explanation || null,
  subjectId: d.subjectId || null,
  topicId: null,
  difficulty: "MEDIUM",
  figureDescriptions: d.figures.map((f) => f.description),
});
const d9 = draft(9);
const noSubject = await action(admin, "saveDraftAction", [d9.id, { ...content(d9), subjectId: null }, true]);
check("publishing is blocked while something is left to fix", noSubject.value?.ok === false && /disciplina/.test(noSubject.value.error), noSubject.value?.error);
const wrongLabel = await action(admin, "saveDraftAction", [d9.id, { ...content(d9), correctLabel: "D" }, true]);
const published9 = sql(`select "questionId" from "QuestionDraft" where id='${d9.id}'`);
check("the official key wins over a different letter chosen by the reviewer", wrongLabel.value?.ok === true && sql(`select label from "QuestionOption" where "questionId"='${published9}' and "isCorrect"`) === "A", wrongLabel.value?.error ?? "");
const q9 = sql(`select source || '|' || "sourceReference" || '|' || coalesce("examPaperId",'') || '|' || "questionNumber" || '|' || year || '|' || coalesce("aiModel",'') from "Question" where id='${published9}'`);
check("published as an official question linked to paper and number", q9.startsWith(`OFFICIAL|E2E 2025 — Prova branca, questão 9|${paperId}|9|2025|gemini-mock`), q9);
check("paper stays in review while drafts are pending", sql(`select status from "ExamPaper" where id='${paperId}'`) === "REVIEW");

const studentView = await page(student, `/questoes/${published9}`);
check("students see it as an official exam question with rendered math", studentView.status === 200 && studentView.body.includes("Prova oficial") && studentView.body.includes("E2E 2025 — Prova branca, questão 9") && studentView.body.includes("katex") && studentView.body.includes("R$ 150,00"));
const optionId = sql(`select id from "QuestionOption" where "questionId"='${published9}' and label='B'`);
const answered = await action(student, "answerQuestionAction", [{ questionId: published9, optionId, timeSpentSec: 30 }], `/questoes/${published9}`);
check("after answering, the AI-written resolution is labeled", answered.value?.ok === true && answered.value.data.isCorrect === false && /escrita com IA e conferida com o gabarito oficial/.test(answered.value.data.explanationNote ?? ""), JSON.stringify(answered.value?.data ?? answered.raw));

const approve3 = await action(admin, "saveDraftAction", [d3.id, content(d3), true]);
const q3 = sql(`select "questionId" from "QuestionDraft" where id='${d3.id}'`);
const figureFile = JSON.parse(sql(`select figures::text from "Question" where id='${q3}'`))[0]?.file;
check("figure questions publish with their image", approve3.value?.ok === true && !!figureFile, approve3.value?.error);
check("figures require a session", (await http(`${BASE}/api/figuras/${figureFile}`)).status === 401);
const fig = await http(`${BASE}/api/figuras/${figureFile}`, { headers: { cookie: student.cookie } });
check("signed-in students load figures", fig.status === 200 && fig.headers.get("content-type") === "image/png" && /private/.test(fig.headers.get("cache-control")));
check("figure names cannot traverse folders", (await http(`${BASE}/api/figuras/..%2F..%2F.env`, { headers: { cookie: student.cookie } })).status === 404);
const q3page = await page(student, `/questoes/${q3}`);
check("figure appears inline in the statement", new RegExp(`<img[^>]+/api/figuras/${figureFile}`).test(q3page.body) && !q3page.body.replace(/<script[\s\S]*?<\/script>/g, "").includes("[[FIGURA"));

const crop = await action(admin, "cropFigureAction", [d3.id, 0, 2, [50, 50, 500, 700]]);
const newFile = JSON.parse(sql(`select figures::text from "Question" where id='${q3}'`))[0]?.file;
check("recropping replaces the figure of the published question and removes the old file", crop.value?.ok === true && newFile !== figureFile && existsSync(`${ROOT}/storage/figuras/${newFile}`) && !existsSync(`${ROOT}/storage/figuras/${figureFile}`), crop.value?.error);
const badCrop = await action(admin, "cropFigureAction", [d3.id, 0, 99, [50, 50, 500, 700]]);
check("crop on a page that does not exist is refused", badCrop.value?.ok === false && /2 páginas/.test(badCrop.value.error), badCrop.value?.error);

const d13 = draft(13);
await action(admin, "setDraftStatusAction", [d13.id, "reject"]);
check("reject a draft", draft(13).status === "REJECTED");
await action(admin, "setDraftStatusAction", [d13.id, "restore"]);
check("restore it for review with issues recomputed", draft(13).status === "PENDING");
const rejectPublished = await action(admin, "setDraftStatusAction", [d9.id, "reject"]);
check("published questions cannot be rejected", rejectPublished.value?.ok === false);

const clean = await action(admin, "approveCleanAction", [{ examPaperId: paperId }]);
const pendingAfter = Number(sql(`select count(*) from "QuestionDraft" where "examPaperId"='${paperId}' and status='PENDING'`));
check("bulk publish only takes drafts without issues", clean.value?.ok === true && clean.value.data.published >= 10 && pendingAfter >= 2 && sql(`select status from "QuestionDraft" where id='${d10.id}'`) === "PENDING", `${JSON.stringify(clean.value)} pending=${pendingAfter}`);
check("a paper with published questions cannot be deleted", (await action(admin, "deletePaperAction", [paperId])).value?.ok === false);
const list = await page(student, `/questoes?fonte=OFFICIAL&q=camisa`);
const byPaper = await page(student, `/questoes?prova=${paperId}`);
const visibleList = byPaper.body.replace(/<script[\s\S]*?<\/script>/g, "").replaceAll("<!-- -->", "");
const positions = ["Questão 1<", "Questão 2<", "Questão 9<"].map((label) => visibleList.indexOf(label));
check("filtering by exam lists its questions in printed order", positions.every((p) => p > 0) && positions[0] < positions[1] && positions[1] < positions[2], positions.join(","));
const afterFirst = await page(student, `/questoes/${sql(`select id from "Question" where "examPaperId"='${paperId}' and "questionNumber"=1`)}?prova=${paperId}`);
check("next question follows the exam numbering", afterFirst.body.includes(`/questoes/${sql(`select id from "Question" where "examPaperId"='${paperId}' and "questionNumber"=2`)}?prova=${paperId}`));
check("question list labels official exams",list.body.includes("Prova oficial E2E 2025"), list.body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(900, 1300));

/* ── generation in the exam's style ─────────────────────────────── */
const mathId = sql(`select id from "Subject" where slug='matematica' and "ownerId" is null`);
const physicsNone = await action(admin, "generateQuestionsAction", [{ competitionId: sql(`select id from "Competition" where slug='policia-federal' and "ownerId" is null`), subjectId: sql(`select id from "Subject" where slug='portugues' and "ownerId" is null`), topicId: null, count: 2, difficulty: null }], "/admin/geradas");
check("generation needs published official questions of that competition", physicsNone.value?.ok === false && /Publique questões oficiais/.test(physicsNone.value.error), physicsNone.value?.error);
const gen = await action(admin, "generateQuestionsAction", [{ competitionId: testCompetition, subjectId: mathId, topicId: null, count: 3, difficulty: null }], "/admin/geradas");
check("generates drafts in the exam's style", gen.value?.ok === true && gen.value.data.created === 3, gen.value?.error ?? gen.raw);
const generated = sql(`select id || '#' || array_to_string(issues, ' || ') || '#' || verification::text from "QuestionDraft" where origin='GENERATED' and "competitionId"='${testCompetition}' order by "createdAt", statement`).split("\n").map((l) => {
  const [id, issues, verification] = l.split("#");
  return { id, issues, verification: JSON.parse(verification) };
});
const g2 = generated.find((g) => g.verification.solverAnswer === "D");
const g1 = generated.find((g) => g.verification.solverAnswer === "B");
check("independent verification disagreement is flagged", !!g2 && /verificação independente chegou em D/.test(g2.issues), g2?.issues);
check("generation grounded on official questions, never with figures", generated.every((g) => g.verification.exampleQuestionIds.length > 0) && !generated.some((g) => /FIGURA/.test(g.issues)));
const genReq = mockRequests().filter((r) => /Crie 3 questões inéditas/.test(r.text))[0];
check("official questions sent as style references", genReq?.text.includes("não copie") && genReq.generationConfig.thinkingConfig?.thinkingLevel === "high");
const gd = { id: g1.id, label: "B", explanation: "Velocidade media: $v = 10$ km/h.", subjectId: mathId, figures: [] };
const approveGen = await action(admin, "saveDraftAction", [g1.id, content(gd), true], "/admin/geradas");
const gq = sql(`select "questionId" from "QuestionDraft" where id='${g1.id}'`);
check("generated question published with an explicit label", approveGen.value?.ok === true && sql(`select source || '|' || "sourceReference" from "Question" where id='${gq}'`) === "GENERATED|Gerada por IA no estilo da E2E. Não é questão oficial.", approveGen.value?.error);
const gView = await page(student, `/questoes/${gq}`);
check("students see generated questions as AI-written, not official", gView.body.includes("Gerada por IA") && !gView.body.includes(">Prova oficial<"));
check("generated review page renders", (await page(admin, "/admin/geradas?filtro=todas")).body.includes("verificação independente chegou em D"));

/* ── free quota ─────────────────────────────────────────────────── */
const quota = await importPaper(admin, { version: "COTA ESGOTADA", pdf: examPdf("B"), key: keyPdf });
const quotaStatus = await waitFor(quota.json.id, ["REVIEW", "FAILED", "EXTRACTING"]);
check("when one model's daily quota runs out, the next configured model continues", quotaStatus === "REVIEW" && sql(`select distinct "aiModel" from "QuestionDraft" where "examPaperId"='${quota.json.id}'`) === "gemini-mock-flash", `${quotaStatus} ${sql(`select "statusNote" from "ExamPaper" where id='${quota.json.id}'`)}`);
check("the answer key file was reused, not read again", mockRequests().filter((r) => /gabarito oficial de um concurso/.test(r.text)).length === 1);

const errors = readFileSync(`${SP}/server-test.log`, "utf8").split("\n").filter((l) => /error|Error/.test(l) && !/^\s+at |digest|NEXT_HTTP_ERROR|NEXT_NOT_FOUND/.test(l));
check("no unexpected server errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// The shared bank must only hold real exam questions: remove everything this test created.
removeTestData();
sql(`delete from "Session" where id like 'eb_%'`);
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
