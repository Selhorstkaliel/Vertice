import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { loadFile, removeFile, saveFile } from "@/lib/storage";
import { reconcileWithKey, type PaperSection } from "@/engines/questions/answer-key";
import { normalizeLabel, type DraftOption } from "@/engines/questions/draft-check";
import { numbersMissingFromSource, padBox } from "@/engines/questions/rich-text";
import { describeQuestionAiError, GEMINI_FILE_TTL_MS, generateJson, QuestionAiError, uploadPdf } from "@/modules/ai/gemini";
import { loadCompetitionCatalog, matchSubject } from "./catalog";
import { cropImage, pdfPageCount, pdfPageTexts, refineFigureBox, renderPage } from "./pdf";
import {
  ANSWER_KEY_PROMPT,
  ANSWER_KEY_SCHEMA,
  catalogText,
  EXTRACTION_SYSTEM,
  extractionPrompt,
  extractionSchema,
  SOLVE_SCHEMA,
  SOLVE_SYSTEM,
  explainWithKeyPrompt,
  solvePrompt,
  type ExtractionOutput,
  type SolveOutput,
} from "./prompts";
import { evaluateDraft, paperKey, type DraftFigure, type DraftVerification, type StoredAnswerKey } from "./review-check";

export type { DraftFigure, DraftVerification, StoredAnswerKey };

// Longer than the slowest AI request plus its retries, renewed after every batch.
const LEASE_MS = 30 * 60_000;
const BATCH_SIZE = 15;
const SOLVE_BATCH = 6;
const MAX_QUESTIONS = 200;

export type ExtractionLog = (message: string) => void;

async function renewLease(paperId: string, patch: Prisma.ExamPaperUpdateInput = {}) {
  await db.examPaper.update({ where: { id: paperId }, data: { ...patch, leaseUntil: new Date(Date.now() + LEASE_MS) } });
}

async function ensureUploaded(paper: { id: string; filePath: string; title: string; geminiFileUri: string | null; geminiFileAt: Date | null }, force = false) {
  if (!force && paper.geminiFileUri && paper.geminiFileAt && Date.now() - paper.geminiFileAt.getTime() < GEMINI_FILE_TTL_MS) return paper.geminiFileUri;
  const { uri, uploadedAt } = await uploadPdf(await loadFile("provas", paper.filePath), paper.title);
  await db.examPaper.update({ where: { id: paper.id }, data: { geminiFileUri: uri, geminiFileAt: uploadedAt } });
  paper.geminiFileUri = uri;
  paper.geminiFileAt = uploadedAt;
  return uri;
}

/** Runs one call, re-uploading the exam once if Google already discarded the file. */
async function withFile<T>(paper: Parameters<typeof ensureUploaded>[0], run: (uri: string) => Promise<T>) {
  try {
    return await run(await ensureUploaded(paper));
  } catch (err) {
    if (err instanceof QuestionAiError && err.kind === "file-expired") return run(await ensureUploaded(paper, true));
    throw err;
  }
}

const waitLog = (log: ExtractionLog) => (seconds: number) => log(`Aguardando a IA para tentar de novo (${seconds} s)…`);

async function readAnswerKey(paperId: string, log: ExtractionLog) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId } });
  if (!paper.answerKeyPath || paper.answerKey) return;
  const twin = paper.answerKeyHash
    ? await db.examPaper.findFirst({ where: { answerKeyHash: paper.answerKeyHash, id: { not: paper.id }, answerKey: { not: Prisma.DbNull } }, select: { answerKey: true } })
    : null;
  if (twin?.answerKey) {
    await db.examPaper.update({ where: { id: paperId }, data: { answerKey: twin.answerKey as Prisma.InputJsonValue } });
    log("Gabarito reaproveitado de outra prova com o mesmo arquivo.");
    return;
  }
  log("Lendo o gabarito oficial…");
  const { uri } = await uploadPdf(await loadFile("provas", paper.answerKeyPath), `Gabarito ${paper.title}`);
  const result = await generateJson<StoredAnswerKey>({ parts: [{ fileUri: uri, mimeType: "application/pdf" }, { text: ANSWER_KEY_PROMPT }], schema: ANSWER_KEY_SCHEMA, temperature: 0, onWait: waitLog(log) });
  const sections = result.data.sections.filter((s) => s.answers.length > 0);
  const key: StoredAnswerKey = { kind: result.data.kind, sections };
  await db.examPaper.update({ where: { id: paperId }, data: { answerKey: key as unknown as Prisma.InputJsonValue, aiRequests: { increment: result.requests } } });
  log(`Gabarito lido: ${sections.reduce((n, s) => n + s.answers.length, 0)} respostas em ${sections.length} bloco(s).`);
}

async function cropFigures(paperId: string, filePath: string, pageCount: number, number: number, figures: ExtractionOutput["questions"][number]["figures"]) {
  const out: DraftFigure[] = [];
  for (const [i, figure] of figures.entries()) {
    const box = padBox(figure.box_2d);
    const page = Math.round(figure.page);
    const valid = page >= 1 && page <= pageCount;
    let file: string | null = null;
    let finalBox = box;
    if (box && valid) {
      const pagePng = await renderPage(paperId, filePath, page);
      finalBox = await refineFigureBox(pagePng, box);
      const png = await cropImage(pagePng, finalBox);
      file = await saveFile("figuras", `${paperId.toLowerCase()}-q${number}-f${i + 1}-${randomBytes(4).toString("hex")}.png`, png);
    }
    out.push({ page: valid ? page : 1, box: finalBox ?? [0, 0, 1000, 1000], description: figure.description?.slice(0, 300) ?? "", file, auto: true });
  }
  return out;
}

async function extractQuestions(paperId: string, log: ExtractionLog) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, include: { competition: { select: { name: true } } } });
  const catalog = await loadCompetitionCatalog(paper.competitionId);
  const pageCount = await pdfPageCount(paper.filePath);
  let texts: string[] | null = null;
  const hint = `Prova: ${paper.competition.name} ${paper.year} — ${paper.version}.`;

  let size = BATCH_SIZE;
  for (let guard = 0; guard < 40; guard++) {
    const current = await db.examPaper.findUniqueOrThrow({ where: { id: paperId } });
    const from = current.extractedUpTo + 1;
    if ((current.expectedCount !== null && from > current.expectedCount) || from > MAX_QUESTIONS) break;
    const to = Math.min(current.expectedCount ?? MAX_QUESTIONS, from + size - 1);
    const first = current.layout === null;
    log(`Transcrevendo questões ${from} a ${to}…`);

    let result;
    try {
      result = await withFile(current, (uri) =>
        generateJson<ExtractionOutput>({
          system: EXTRACTION_SYSTEM,
          parts: [{ fileUri: uri, mimeType: "application/pdf" }, { text: extractionPrompt({ from, to, first, catalog: catalogText(catalog.subjects), hint }) }],
          schema: extractionSchema(first),
          temperature: 0,
          maxOutputTokens: 60_000,
          onWait: waitLog(log),
        }),
      );
    } catch (err) {
      if (err instanceof QuestionAiError && (err.kind === "truncated" || err.kind === "invalid-output") && size > 3) {
        size = Math.max(3, Math.floor(size / 2));
        log(`Resposta da IA incompleta; tentando lotes de ${size} questões.`);
        continue;
      }
      throw err;
    }

    const patch: Prisma.ExamPaperUpdateInput = { aiRequests: { increment: result.requests } };
    let layout = (current.layout as PaperSection[] | null) ?? [];
    let expected = current.expectedCount;
    if (first) {
      layout = (result.data.paper?.sections ?? []).filter((s) => s.subject && s.from > 0 && s.to >= s.from);
      patch.layout = layout as unknown as Prisma.InputJsonValue;
      const total = result.data.paper?.totalQuestions;
      if (total && total > 0 && total <= MAX_QUESTIONS) expected = patch.expectedCount = total;
      log(`Prova com ${total ?? "?"} questões objetivas${layout.length ? ` em ${layout.length} parte(s): ${layout.map((s) => `${s.subject} ${s.from}–${s.to}`).join(", ")}` : ""}.`);
      const storedKey = current.answerKey as StoredAnswerKey | null;
      const fixed = storedKey ? reconcileWithKey(current.version, storedKey.sections, layout, expected, MAX_QUESTIONS) : { expected, layout };
      if (fixed.expected !== expected) {
        log(`O gabarito oficial lista ${fixed.expected} questões; a leitura segue até a ${fixed.expected}.`);
        expected = patch.expectedCount = fixed.expected;
      }
      if (fixed.layout !== layout) {
        log("As partes informadas não cobrem a prova inteira; o gabarito será aplicado sem elas.");
        layout = fixed.layout;
        patch.layout = layout as unknown as Prisma.InputJsonValue;
      }
    }
    const examPaper = { version: current.version, layout: layout as unknown as Prisma.JsonValue, answerKey: current.answerKey };

    const questions = result.data.questions.filter((q) => q.number >= from && q.number <= to && (expected === null || q.number <= expected));
    const existing = new Set((await db.questionDraft.findMany({ where: { examPaperId: paperId, number: { gte: from, lte: to } }, select: { number: true } })).map((d) => d.number));
    for (const q of questions) {
      if (existing.has(q.number)) continue;
      existing.add(q.number);
      const section = layout.find((s) => q.number >= s.from && q.number <= s.to);
      const topic = q.topic ? catalog.topicIdByCode.get(q.topic.trim().toUpperCase()) : undefined;
      const subjectId = topic?.subjectId ?? matchSubject(catalog, q.subject, section?.subject);
      const figures = await cropFigures(paperId, current.filePath, pageCount, q.number, q.figures ?? []);
      texts ??= await pdfPageTexts(current.filePath).catch(() => []);
      const source = [texts[q.page - 1], texts[q.page]].filter(Boolean).join(" ");
      const verification: DraftVerification = { unmatchedNumbers: source.length > 200 ? numbersMissingFromSource([q.statement, ...q.options.map((o) => o.text)].join(" "), source) : [] };
      const draft = { origin: "EXTRACTED" as const, number: q.number, verification: verification as unknown as Prisma.JsonValue, examPaper };
      const check = await evaluateDraft(draft, { statement: q.statement, options: q.options, correctLabel: null, subjectId, subjectHint: q.subject }, figures, false);
      await db.questionDraft.create({
        data: {
          origin: "EXTRACTED",
          competitionId: current.competitionId,
          examPaperId: paperId,
          number: q.number,
          statement: q.statement.trim(),
          options: check.options as unknown as Prisma.InputJsonValue,
          correctLabel: check.correctLabel,
          subjectId,
          topicId: topic?.topicId ?? null,
          difficulty: q.difficulty ?? null,
          hasFigure: figures.length > 0,
          figures: figures as unknown as Prisma.InputJsonValue,
          issues: check.issues,
          aiModel: result.model,
          verification: verification as unknown as Prisma.InputJsonValue,
          // Annulled questions never reach the bank.
          status: check.annulled ? "REJECTED" : "PENDING",
          reviewedAt: check.annulled ? new Date() : null,
        },
      });
    }

    patch.extractedUpTo = to;
    patch.statusNote = paperKey(examPaper).note;
    if (questions.length === 0 && !first) {
      // Nothing in this range: the paper ended earlier than expected.
      patch.extractedUpTo = patch.expectedCount = from - 1;
      await renewLease(paperId, patch);
      log(`Nenhuma questão a partir da ${from}; extração encerrada.`);
      break;
    }
    await renewLease(paperId, patch);
    log(`${questions.length} questão(ões) transcrita(s) neste lote.`);
    if (expected !== null && to >= expected) break;
  }
}

const optionLines = (options: unknown) => (options as DraftOption[]).map((o) => `${o.label}) ${o.text}`).join("\n");

/**
 * Commented resolutions. Each batch is solved without the key; when the
 * solution disagrees with the official answer, a second pass explains the
 * official answer and the draft is flagged for a careful look.
 */
async function solveDrafts(paperId: string, log: ExtractionLog) {
  for (let guard = 0; guard < 40; guard++) {
    const candidates = await db.questionDraft.findMany({ where: { examPaperId: paperId, status: "PENDING", explanation: null }, orderBy: { number: "asc" } });
    const drafts = candidates.filter((d) => !(d.verification as DraftVerification | null)?.model).slice(0, SOLVE_BATCH);
    if (drafts.length === 0) return;
    log(`Resolvendo as questões ${drafts[0]!.number} a ${drafts.at(-1)!.number}…`);
    const current = await db.examPaper.findUniqueOrThrow({ where: { id: paperId } });
    const ask = (text: string) =>
      withFile(current, (uri) =>
        generateJson<SolveOutput>({
          system: SOLVE_SYSTEM,
          parts: [{ fileUri: uri, mimeType: "application/pdf" }, { text: `As questões abaixo foram transcritas deste PDF (consulte as figuras nele).\n\n${text}` }],
          schema: SOLVE_SCHEMA,
          thinking: "high",
          maxOutputTokens: 60_000,
          onWait: waitLog(log),
        }),
      );
    const find = (out: SolveOutput, number: number | null) => out.solutions.find((s) => s.ref.replace(/\D/g, "") === String(number));

    const solved = await ask(solvePrompt(drafts.map((d) => ({ ref: `Q${d.number}`, statement: d.statement, options: optionLines(d.options), officialLabel: null }))));
    let requests = solved.requests;
    const disagreeing = drafts.filter((d) => {
      const answer = find(solved.data, d.number)?.answer;
      return d.correctLabel && answer && normalizeLabel(answer) !== d.correctLabel;
    });
    let explained: Awaited<ReturnType<typeof ask>> | null = null;
    if (disagreeing.length > 0) {
      log(`${disagreeing.length} resolução(ões) divergiram do gabarito; explicando a partir do gabarito oficial…`);
      explained = await ask(explainWithKeyPrompt(disagreeing.map((d) => ({ ref: `Q${d.number}`, statement: d.statement, options: optionLines(d.options), officialLabel: d.correctLabel }))));
      requests += explained.requests;
    }

    for (const d of drafts) {
      const independent = find(solved.data, d.number);
      const fromKey = explained && disagreeing.includes(d) ? find(explained.data, d.number) : undefined;
      const verification: DraftVerification = {
        ...((d.verification as DraftVerification | null) ?? {}),
        aiAnswer: independent ? normalizeLabel(independent.answer) || null : null,
        confidence: independent?.confidence ?? "LOW",
        model: solved.model,
        explainedFromKey: fromKey ? { answer: normalizeLabel(fromKey.answer) || null, confidence: fromKey.confidence } : undefined,
      };
      const explanation = (fromKey ?? independent)?.explanation.trim() || null;
      await db.questionDraft.update({ where: { id: d.id }, data: { explanation, verification: verification as unknown as Prisma.InputJsonValue } });
    }
    await renewLease(paperId, { aiRequests: { increment: requests } });
  }
}

/**
 * Drafts whose independent solution disagrees with the official answer but
 * were never explained from it — when the key arrived or changed after solving.
 */
async function explainDisagreements(paperId: string, log: ExtractionLog) {
  const pending = (await db.questionDraft.findMany({ where: { examPaperId: paperId, status: "PENDING", correctLabel: { not: null } }, orderBy: { number: "asc" } })).filter((d) => {
    const v = (d.verification as DraftVerification | null) ?? {};
    return v.model && v.aiAnswer && v.aiAnswer !== d.correctLabel && !v.explainedFromKey;
  });
  for (let start = 0; start < pending.length; start += SOLVE_BATCH) {
    const drafts = pending.slice(start, start + SOLVE_BATCH);
    log(`Explicando ${drafts.length} questão(ões) a partir do gabarito oficial…`);
    const current = await db.examPaper.findUniqueOrThrow({ where: { id: paperId } });
    const result = await withFile(current, (uri) =>
      generateJson<SolveOutput>({
        system: SOLVE_SYSTEM,
        parts: [{ fileUri: uri, mimeType: "application/pdf" }, { text: `As questões abaixo foram transcritas deste PDF (consulte as figuras nele).\n\n${explainWithKeyPrompt(drafts.map((d) => ({ ref: `Q${d.number}`, statement: d.statement, options: optionLines(d.options), officialLabel: d.correctLabel })))}` }],
        schema: SOLVE_SCHEMA,
        thinking: "high",
        maxOutputTokens: 60_000,
        onWait: waitLog(log),
      }),
    );
    for (const d of drafts) {
      const fromKey = result.data.solutions.find((s) => s.ref.replace(/\D/g, "") === String(d.number));
      if (!fromKey) continue;
      const verification: DraftVerification = { ...((d.verification as DraftVerification | null) ?? {}), explainedFromKey: { answer: normalizeLabel(fromKey.answer) || null, confidence: fromKey.confidence } };
      await db.questionDraft.update({ where: { id: d.id }, data: { explanation: fromKey.explanation.trim() || d.explanation, verification: verification as unknown as Prisma.InputJsonValue } });
    }
    await renewLease(paperId, { aiRequests: { increment: result.requests } });
  }
}

/**
 * Re-applies the official key and every automatic check to the pending drafts
 * of a paper — after a key is added or replaced, or at the end of a run.
 */
export async function recheckPaperDrafts(paperId: string) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId } });
  const drafts = await db.questionDraft.findMany({ where: { examPaperId: paperId, status: { in: ["PENDING", "REJECTED"] } } });
  let annulled = 0;
  for (const d of drafts) {
    // Rejected by a person stays rejected; only automatic rejections (annulled) are re-evaluated.
    if (d.status === "REJECTED" && !d.issues.some((i) => i.includes("anulada"))) continue;
    const figures = (d.figures as DraftFigure[] | null) ?? [];
    const check = await evaluateDraft({ ...d, examPaper: paper }, { statement: d.statement, options: d.options as unknown as DraftOption[], correctLabel: d.correctLabel, subjectId: d.subjectId }, figures, false);
    if (check.annulled) annulled++;
    await db.questionDraft.update({
      where: { id: d.id },
      data: { correctLabel: check.correctLabel, issues: check.issues, status: check.annulled ? "REJECTED" : "PENDING", reviewedAt: check.annulled ? (d.reviewedAt ?? new Date()) : null },
    });
  }
  return { checked: drafts.length, annulled };
}

/**
 * Re-crops figures that were cropped automatically and never adjusted, on drafts
 * still waiting for review. Published questions and manual crops are left alone.
 */
async function recropAutoFigures(paperId: string) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, select: { id: true, filePath: true } });
  const drafts = await db.questionDraft.findMany({ where: { examPaperId: paperId, status: "PENDING", hasFigure: true } });
  let count = 0;
  for (const d of drafts) {
    const figures = (d.figures as DraftFigure[] | null) ?? [];
    // Older drafts carry no flag: they are automatic while the crop warning is still open.
    const untouched = d.issues.some((i) => i.startsWith("Confira o recorte"));
    let changed = false;
    const next: DraftFigure[] = [];
    for (const f of figures) {
      if (!f.file || f.auto === false || (f.auto === undefined && !untouched)) {
        next.push(f);
        continue;
      }
      const pagePng = await renderPage(paper.id, paper.filePath, f.page);
      const box = await refineFigureBox(pagePng, f.box);
      if (box.join() === f.box.join()) {
        next.push({ ...f, auto: true });
        continue;
      }
      const file = await saveFile("figuras", `${paperId.toLowerCase()}-q${d.number}-f${next.length + 1}-${randomBytes(4).toString("hex")}.png`, await cropImage(pagePng, box));
      await removeFile("figuras", f.file);
      next.push({ ...f, box, file, auto: true });
      changed = true;
      count++;
    }
    if (changed) await db.questionDraft.update({ where: { id: d.id }, data: { figures: next as unknown as Prisma.InputJsonValue } });
  }
  return count;
}

/**
 * Re-checks a paper that was already read, after the matching rules or the key
 * changed: applies the key again and explains any new disagreement. Uses the AI
 * only for those explanations. Leaves the reading status as it was.
 */
export async function refreshPaper(paperId: string, log: ExtractionLog = () => {}) {
  const now = new Date();
  const before = await db.examPaper.findUnique({ where: { id: paperId }, select: { status: true } });
  if (!before) return { ok: false as const, message: "Prova não encontrada." };
  const { count } = await db.examPaper.updateMany({ where: { id: paperId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil: new Date(now.getTime() + LEASE_MS) } });
  if (count === 0) return { ok: false as const, message: "Esta prova está sendo processada agora." };
  try {
    const recropped = await recropAutoFigures(paperId);
    if (recropped) log(`${recropped} figura(s) recortada(s) de novo.`);
    await recheckPaperDrafts(paperId);
    await explainDisagreements(paperId, log);
    await recheckPaperDrafts(paperId);
    const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, select: { expectedCount: true, extractedUpTo: true } });
    const complete = paper.expectedCount !== null && paper.extractedUpTo >= paper.expectedCount;
    const pending = await db.questionDraft.count({ where: { examPaperId: paperId, status: "PENDING" } });
    const status = complete && ["REVIEW", "PUBLISHED"].includes(before.status) ? (pending > 0 ? "REVIEW" : "PUBLISHED") : before.status;
    const key = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, select: { version: true, layout: true, answerKey: true } });
    await db.examPaper.update({ where: { id: paperId }, data: { status, leaseUntil: null, statusNote: before.status === "FAILED" || before.status === "EXTRACTING" ? undefined : paperKey(key).note } });
    return { ok: true as const, message: "Prova reverificada." };
  } catch (err) {
    await db.examPaper.update({ where: { id: paperId }, data: { leaseUntil: null } });
    const message = describeQuestionAiError(err);
    if (!(err instanceof QuestionAiError)) console.error("[exam-papers] refresh failed", paperId, err);
    return { ok: false as const, message };
  }
}

/**
 * Reads one exam end to end: answer key, questions in batches (with figure
 * crops) and a commented resolution per question. Safe to call again: it
 * resumes after the last saved batch, and a lease keeps runs from overlapping.
 */
export async function runPaperExtraction(paperId: string, log: ExtractionLog = () => {}) {
  const now = new Date();
  const { count } = await db.examPaper.updateMany({
    where: { id: paperId, status: { in: ["UPLOADED", "EXTRACTING", "FAILED", "REVIEW"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { status: "EXTRACTING", leaseUntil: new Date(now.getTime() + LEASE_MS), statusNote: null },
  });
  if (count === 0) return { ok: false as const, message: "Esta prova já está sendo processada ou já foi publicada." };

  try {
    await readAnswerKey(paperId, log);
    await extractQuestions(paperId, log);
    await solveDrafts(paperId, log);
    await recheckPaperDrafts(paperId);
    await explainDisagreements(paperId, log);
    await recheckPaperDrafts(paperId);
    const pending = await db.questionDraft.count({ where: { examPaperId: paperId, status: "PENDING" } });
    await db.examPaper.update({ where: { id: paperId }, data: { status: pending > 0 ? "REVIEW" : "PUBLISHED", leaseUntil: null } });
    log("Extração concluída. As questões aguardam revisão.");
    return { ok: true as const, message: "Extração concluída." };
  } catch (err) {
    const paused = err instanceof QuestionAiError && (err.kind === "daily-quota" || err.kind === "rate-limit");
    const message = describeQuestionAiError(err);
    if (!(err instanceof QuestionAiError)) console.error("[exam-papers] extraction failed", paperId, err);
    await db.examPaper.update({ where: { id: paperId }, data: { status: paused ? "EXTRACTING" : "FAILED", leaseUntil: null, statusNote: message } });
    log(message);
    return { ok: false as const, message };
  }
}
