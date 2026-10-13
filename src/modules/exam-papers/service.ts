import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type Difficulty } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { downloadPublicFile, PublicDownloadError } from "@/lib/public-download";
import { imageType, isPdf, removeFile, saveFile, sha256 } from "@/lib/storage";
import { isTrueFalse } from "@/engines/questions/draft-check";
import type { DraftOption } from "@/engines/questions/draft-check";
import { padBox, type Box } from "@/engines/questions/rich-text";
import { cropImage, pdfPageCount, renderPage } from "./pdf";
import { evaluateDraft, type DraftFigure, type DraftVerification } from "./review-check";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_FIGURE_BYTES = 2 * 1024 * 1024;

/* ── importing ─────────────────────────────────────────────────────── */

/** Downloads a public file (official exam, key or archive). Internal network addresses are refused. */
export async function downloadFile(url: string) {
  try {
    return await downloadPublicFile(url, { maxBytes: MAX_PDF_BYTES });
  } catch (err) {
    if (err instanceof PublicDownloadError) throw new DomainError(err.message.replace("do tamanho máximo", "de 40 MB"));
    throw err;
  }
}

/** Downloads a public PDF (official exam or key). */
export async function downloadPdf(url: string) {
  const bytes = await downloadFile(url);
  if (!isPdf(bytes)) throw new DomainError(`O endereço ${new URL(url).pathname} não devolveu um PDF.`);
  return bytes;
}

export interface NewPaperInput {
  competitionId: string;
  year: number;
  version: string;
  title?: string | null;
  pdf: Uint8Array;
  answerKey?: Uint8Array | null;
  sourceUrl?: string | null;
  answerKeyUrl?: string | null;
}

export async function createExamPaper(input: NewPaperInput, adminId: string | null) {
  if (!isPdf(input.pdf)) throw new DomainError("O arquivo da prova não é um PDF.");
  if (input.pdf.length > MAX_PDF_BYTES) throw new DomainError("O PDF da prova passa de 40 MB.");
  if (input.answerKey && !isPdf(input.answerKey)) throw new DomainError("O arquivo do gabarito não é um PDF.");

  const competition = await db.competition.findFirst({ where: { id: input.competitionId, ownerId: null }, select: { id: true, name: true, examBoardId: true } });
  if (!competition) throw new DomainError("Concurso não encontrado no catálogo.");

  const fileHash = sha256(input.pdf);
  const duplicate = await db.examPaper.findFirst({ where: { OR: [{ fileHash }, { competitionId: competition.id, year: input.year, version: input.version }] }, select: { id: true, title: true } });
  if (duplicate) throw new DomainError(`Esta prova já foi importada: ${duplicate.title}.`);

  const filePath = await saveFile("provas", `${fileHash.slice(0, 32)}.pdf`, input.pdf);
  try {
    await pdfPageCount(filePath);
  } catch {
    await removeFile("provas", filePath);
    throw new DomainError("Não foi possível abrir o PDF da prova. O arquivo pode estar corrompido.");
  }
  const answerKeyHash = input.answerKey ? sha256(input.answerKey) : null;
  const answerKeyPath = input.answerKey && answerKeyHash ? await saveFile("provas", `gabarito-${answerKeyHash.slice(0, 32)}.pdf`, input.answerKey) : null;

  return db.examPaper.create({
    data: {
      competitionId: competition.id,
      examBoardId: competition.examBoardId,
      year: input.year,
      version: input.version,
      title: input.title?.trim() || `${competition.name} ${input.year} — ${input.version}`,
      sourceUrl: input.sourceUrl ?? null,
      answerKeyUrl: input.answerKeyUrl ?? null,
      fileHash,
      filePath,
      answerKeyPath,
      answerKeyHash,
      importedById: adminId,
    },
    select: { id: true, title: true },
  });
}

/** Adds or replaces the official key of a paper; drafts are re-checked on the next run or save. */
export async function attachAnswerKey(paperId: string, bytes: Uint8Array, url: string | null) {
  if (!isPdf(bytes)) throw new DomainError("O arquivo do gabarito não é um PDF.");
  const hash = sha256(bytes);
  const path = await saveFile("provas", `gabarito-${hash.slice(0, 32)}.pdf`, bytes);
  await db.examPaper.update({ where: { id: paperId }, data: { answerKeyPath: path, answerKeyHash: hash, answerKeyUrl: url, answerKey: Prisma.DbNull } });
}

export async function deleteExamPaper(paperId: string) {
  const paper = await db.examPaper.findUnique({ where: { id: paperId }, include: { drafts: { select: { figures: true } }, _count: { select: { questions: true } } } });
  if (!paper) throw new DomainError("Prova não encontrada.");
  if (paper._count.questions > 0) throw new DomainError("Esta prova já tem questões publicadas no banco e não pode ser apagada.");
  if (paper.leaseUntil && paper.leaseUntil > new Date()) throw new DomainError("Aguarde a extração em andamento terminar.");
  await db.examPaper.delete({ where: { id: paperId } });
  const others = await db.examPaper.count({ where: { OR: [{ filePath: paper.filePath }, ...(paper.answerKeyPath ? [{ answerKeyPath: paper.answerKeyPath }] : [])] } });
  if (others === 0) {
    await removeFile("provas", paper.filePath);
    if (paper.answerKeyPath) await removeFile("provas", paper.answerKeyPath);
  }
  for (const d of paper.drafts) for (const f of (d.figures as DraftFigure[] | null) ?? []) if (f.file) await removeFile("figuras", f.file);
}

/* ── reviewing ─────────────────────────────────────────────────────── */

export interface DraftEdit {
  statement: string;
  options: DraftOption[];
  correctLabel: string | null;
  explanation: string | null;
  subjectId: string | null;
  topicId: string | null;
  difficulty: Difficulty | null;
  figureDescriptions: string[];
}

const draftInclude = { examPaper: true, competition: { select: { id: true, name: true, examBoardId: true } }, question: { select: { id: true, _count: { select: { attempts: true } } } } } as const;
type DraftWithPaper = Prisma.QuestionDraftGetPayload<{ include: typeof draftInclude }>;

async function loadDraft(id: string) {
  const draft = await db.questionDraft.findUnique({ where: { id }, include: draftInclude });
  if (!draft) throw new DomainError("Questão em revisão não encontrada.");
  return draft;
}

/** Re-evaluates a draft with its current (or edited) content. */
function recheck(draft: DraftWithPaper, edit: { statement: string; options: DraftOption[]; correctLabel: string | null; subjectId: string | null }, figures: DraftFigure[], reviewed: boolean) {
  return evaluateDraft(draft, edit, figures, reviewed);
}

async function validateClassification(subjectId: string | null, topicId: string | null) {
  if (!subjectId) return;
  const subject = await db.subject.findFirst({ where: { id: subjectId, ownerId: null }, select: { id: true } });
  if (!subject) throw new DomainError("Disciplina não encontrada no catálogo.");
  if (topicId && !(await db.topic.findFirst({ where: { id: topicId, subjectId, ownerId: null }, select: { id: true } }))) throw new DomainError("O tópico não pertence à disciplina escolhida.");
}

function sourceReference(draft: DraftWithPaper) {
  if (draft.origin === "GENERATED") return `Gerada por IA no estilo da ${draft.competition.name}. Não é questão oficial.`;
  const paper = draft.examPaper!;
  return `${draft.competition.name} ${paper.year} — ${paper.version}, questão ${draft.number}`;
}

async function refreshPaperStatus(paperId: string | null) {
  if (!paperId) return;
  const paper = await db.examPaper.findUnique({ where: { id: paperId }, select: { status: true, leaseUntil: true } });
  if (!paper || !["REVIEW", "PUBLISHED"].includes(paper.status)) return;
  const pending = await db.questionDraft.count({ where: { examPaperId: paperId, status: "PENDING" } });
  const status = pending > 0 ? "REVIEW" : "PUBLISHED";
  if (status !== paper.status) await db.examPaper.update({ where: { id: paperId }, data: { status } });
}

/**
 * Saves a reviewer's edits. With `approve`, the question goes to the shared
 * bank — only when nothing is left to fix. Edits to an already published
 * question update it in place, keeping students' attempts.
 */
export async function saveDraft(id: string, edit: DraftEdit, approve: boolean) {
  const draft = await loadDraft(id);
  if (draft.status === "REJECTED") throw new DomainError("Restaure a questão antes de editar.");
  await validateClassification(edit.subjectId, edit.topicId);
  const figures = ((draft.figures as DraftFigure[] | null) ?? []).map((f, i) => ({ ...f, description: edit.figureDescriptions[i]?.trim().slice(0, 300) ?? f.description }));
  const check = await recheck(draft, edit, figures, true);
  const issues = check.issues;
  if (check.annulled) throw new DomainError("Questão anulada no gabarito oficial não entra no banco.");

  const published = draft.status === "APPROVED" && draft.question;
  if ((approve || published) && issues.length > 0) throw new DomainError(`Antes de publicar: ${issues.join(" ")}`);

  const data = {
    statement: edit.statement.trim(),
    options: check.options as unknown as Prisma.InputJsonValue,
    correctLabel: check.correctLabel,
    explanation: edit.explanation?.trim() || null,
    subjectId: edit.subjectId,
    topicId: edit.topicId,
    difficulty: edit.difficulty,
    figures: figures as unknown as Prisma.InputJsonValue,
    issues,
  };

  if (!approve && !published) {
    await db.questionDraft.update({ where: { id }, data });
    return { published: false };
  }

  const verification = draft.verification as DraftVerification | null;
  const questionData = {
    statement: data.statement,
    explanation: data.explanation,
    difficulty: edit.difficulty ?? "MEDIUM",
    subjectId: edit.subjectId!,
    topicId: edit.topicId,
    figures: figures.map((f) => ({ file: f.file, description: f.description })) as unknown as Prisma.InputJsonValue,
    // Who wrote the text students read besides the official statement.
    aiModel: draft.origin === "GENERATED" ? draft.aiModel : data.explanation && verification?.model ? verification.model : null,
  };

  await db.$transaction(async (tx) => {
    if (published) {
      const current = await tx.questionOption.findMany({ where: { questionId: draft.question!.id }, orderBy: { order: "asc" } });
      if (current.length !== check.options.length) {
        if (draft.question!._count.attempts > 0) throw new DomainError("Esta questão já foi respondida por alunos: mantenha o mesmo número de alternativas.");
        await tx.questionOption.deleteMany({ where: { questionId: draft.question!.id } });
        await tx.questionOption.createMany({ data: check.options.map((o, order) => ({ questionId: draft.question!.id, label: o.label, text: o.text, isCorrect: o.label === check.correctLabel, order })) });
      } else {
        for (const [order, o] of check.options.entries()) {
          await tx.questionOption.update({ where: { id: current[order]!.id }, data: { label: o.label, text: o.text, isCorrect: o.label === check.correctLabel, order } });
        }
      }
      await tx.question.update({ where: { id: draft.question!.id }, data: questionData });
      await tx.questionDraft.update({ where: { id }, data: { ...data, reviewedAt: new Date() } });
      return;
    }
    const question = await tx.question.create({
      data: {
        ...questionData,
        // Prova de julgamento de itens entra como certo ou errado; o resto, como múltipla escolha.
        type: isTrueFalse(check.options) ? "TRUE_FALSE" : "MULTIPLE_CHOICE",
        competitionId: draft.competitionId,
        examBoardId: draft.examPaper?.examBoardId ?? draft.competition.examBoardId,
        year: draft.examPaper?.year ?? null,
        source: draft.origin === "GENERATED" ? "GENERATED" : "OFFICIAL",
        sourceReference: sourceReference(draft),
        examPaperId: draft.examPaperId,
        questionNumber: draft.number,
        options: { create: check.options.map((o, order) => ({ label: o.label, text: o.text, isCorrect: o.label === check.correctLabel, order })) },
      },
      select: { id: true },
    });
    await tx.questionDraft.update({ where: { id }, data: { ...data, status: "APPROVED", questionId: question.id, reviewedAt: new Date() } });
  });
  await refreshPaperStatus(draft.examPaperId);
  return { published: true };
}

export async function rejectDraft(id: string) {
  const draft = await loadDraft(id);
  if (draft.status === "APPROVED") throw new DomainError("Esta questão já está publicada. Edite-a em vez de rejeitar.");
  await db.questionDraft.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date() } });
  await refreshPaperStatus(draft.examPaperId);
}

export async function restoreDraft(id: string) {
  const draft = await loadDraft(id);
  if (draft.status !== "REJECTED") return;
  const figures = (draft.figures as DraftFigure[] | null) ?? [];
  const check = await recheck(draft, { statement: draft.statement, options: draft.options as unknown as DraftOption[], correctLabel: draft.correctLabel, subjectId: draft.subjectId }, figures, false);
  if (check.annulled) throw new DomainError("Questão anulada no gabarito oficial não entra no banco.");
  await db.questionDraft.update({ where: { id }, data: { status: "PENDING", reviewedAt: null, issues: check.issues } });
  await refreshPaperStatus(draft.examPaperId);
}

/** Publishes every pending draft of a paper that has no open issue at all. */
export async function approveCleanDrafts(filter: { examPaperId?: string; origin?: "GENERATED" }) {
  const drafts = await db.questionDraft.findMany({ where: { ...filter, status: "PENDING", issues: { isEmpty: true }, subjectId: { not: null }, correctLabel: { not: null } }, select: { id: true } });
  let published = 0;
  const failed: string[] = [];
  for (const d of drafts) {
    const full = await loadDraft(d.id);
    try {
      const figures = (full.figures as DraftFigure[] | null) ?? [];
      await saveDraft(d.id, { statement: full.statement, options: full.options as unknown as DraftOption[], correctLabel: full.correctLabel, explanation: full.explanation, subjectId: full.subjectId, topicId: full.topicId, difficulty: full.difficulty, figureDescriptions: figures.map((f) => f.description) }, true);
      published++;
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { published, failed };
}

/* ── figures ───────────────────────────────────────────────────────── */

async function draftFigures(id: string) {
  const draft = await loadDraft(id);
  if (draft.status === "REJECTED") throw new DomainError("Restaure a questão antes de editar.");
  return { draft, figures: (draft.figures as DraftFigure[] | null) ?? [] };
}

async function storeFigures(draft: DraftWithPaper, figures: DraftFigure[], replaced: (string | null)[]) {
  const check = await recheck(draft, { statement: draft.statement, options: draft.options as unknown as DraftOption[], correctLabel: draft.correctLabel, subjectId: draft.subjectId }, figures, false);
  await db.questionDraft.update({ where: { id: draft.id }, data: { figures: figures as unknown as Prisma.InputJsonValue, hasFigure: figures.length > 0, issues: check.issues } });
  if (draft.status === "APPROVED" && draft.question) {
    await db.question.update({ where: { id: draft.question.id }, data: { figures: figures.map((f) => ({ file: f.file, description: f.description })) as unknown as Prisma.InputJsonValue } });
  }
  // Old files stay until nothing references them.
  for (const file of replaced) if (file && !figures.some((f) => f.file === file)) await removeFile("figuras", file);
}

function figureName(draft: DraftWithPaper, index: number, ext: "png" | "jpeg") {
  return `${(draft.examPaperId ?? "gerada").toLowerCase()}-d${draft.id.toLowerCase().slice(-10)}-f${index + 1}-${randomBytes(4).toString("hex")}.${ext === "jpeg" ? "jpg" : "png"}`;
}

/** Re-cuts figure `index` from a page of the paper with a box chosen by the reviewer. */
export async function cropDraftFigure(id: string, index: number, page: number, rawBox: number[]) {
  const { draft, figures } = await draftFigures(id);
  if (!draft.examPaper) throw new DomainError("Só questões de prova importada têm páginas para recortar.");
  if (index < 0 || index > figures.length) throw new DomainError("Figura não encontrada.");
  const pages = await pdfPageCount(draft.examPaper.filePath);
  if (page < 1 || page > pages) throw new DomainError(`A prova tem ${pages} páginas.`);
  const box = padBox(rawBox, 0) as Box | null;
  if (!box) throw new DomainError("Área de recorte pequena demais.");
  const png = await cropImage(await renderPage(draft.examPaper.id, draft.examPaper.filePath, page), box);
  const file = await saveFile("figuras", figureName(draft, index, "png"), png);
  const next = [...figures];
  const previous = next[index]?.file ?? null;
  next[index] = { page, box, description: next[index]?.description ?? "", file, auto: false };
  await storeFigures(draft, next, [previous]);
  return { file };
}

export async function uploadDraftFigure(id: string, index: number, bytes: Uint8Array) {
  const { draft, figures } = await draftFigures(id);
  if (bytes.length > MAX_FIGURE_BYTES) throw new DomainError("Imagem acima de 2 MB.");
  const type = imageType(bytes);
  if (!type) throw new DomainError("Envie uma imagem PNG ou JPEG.");
  if (index < 0 || index > figures.length) throw new DomainError("Figura não encontrada.");
  const file = await saveFile("figuras", figureName(draft, index, type), bytes);
  const next = [...figures];
  const previous = next[index]?.file ?? null;
  next[index] = { page: next[index]?.page ?? 1, box: next[index]?.box ?? [0, 0, 1000, 1000], description: next[index]?.description ?? "", file, auto: false };
  await storeFigures(draft, next, [previous]);
  return { file };
}

export async function removeDraftFigure(id: string, index: number) {
  const { draft, figures } = await draftFigures(id);
  if (!figures[index]) throw new DomainError("Figura não encontrada.");
  const removed = figures[index]!.file;
  await storeFigures(draft, figures.filter((_, i) => i !== index), [removed]);
}
