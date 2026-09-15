import "server-only";
import type { ContentSource, Difficulty, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const QUESTION_PAGE_SIZE = 20;

export interface QuestionFilters {
  concurso?: string;
  banca?: string;
  ano?: string;
  materia?: string;
  assunto?: string;
  dificuldade?: string;
  status?: string;
  fonte?: string;
  /** Imported exam paper: questions in the order they were printed. */
  prova?: string;
  q?: string;
}

const DIFFICULTIES = new Set(["EASY", "MEDIUM", "HARD"]);
const SOURCES = new Set(["OFFICIAL", "LICENSED", "PLATFORM", "USER", "GENERATED", "DEMO"]);

export function questionWhere(userId: string, f: QuestionFilters): Prisma.QuestionWhereInput {
  const and: Prisma.QuestionWhereInput[] = [{ OR: [{ ownerId: null }, { ownerId: userId }] }];
  if (f.concurso) and.push({ OR: [{ competitionId: f.concurso }, { topic: { competitions: { some: { competitionId: f.concurso } } } }] });
  if (f.banca) and.push({ examBoardId: f.banca });
  if (f.prova) and.push({ examPaperId: f.prova });
  if (f.ano && /^\d{4}$/.test(f.ano)) and.push({ year: Number(f.ano) });
  if (f.materia) and.push({ subjectId: f.materia });
  if (f.assunto) and.push({ OR: [{ topicId: f.assunto }, { topic: { parentId: f.assunto } }] });
  if (f.dificuldade && DIFFICULTIES.has(f.dificuldade)) and.push({ difficulty: f.dificuldade as Difficulty });
  if (f.fonte && SOURCES.has(f.fonte)) and.push({ source: f.fonte as ContentSource });
  if (f.q?.trim()) and.push({ statement: { contains: f.q.trim().slice(0, 80), mode: "insensitive" } });
  switch (f.status) {
    case "nunca":
      and.push({ NOT: { states: { some: { userId, attempts: { gt: 0 } } } } });
      break;
    case "acertadas":
      and.push({ states: { some: { userId, lastCorrect: true } } });
      break;
    case "erradas":
      and.push({ states: { some: { userId, lastCorrect: false } } });
      break;
    case "favoritas":
      and.push({ states: { some: { userId, favorite: true } } });
      break;
    case "revisar":
      and.push({ states: { some: { userId, reviewLater: true } } });
      break;
  }
  return { AND: and };
}

/** Within one exam, the printed order; otherwise a stable order. */
function questionOrder(f: QuestionFilters): Prisma.QuestionOrderByWithRelationInput[] {
  return f.prova ? [{ questionNumber: "asc" }, { id: "asc" }] : [{ id: "asc" }];
}

export async function listQuestions(userId: string, filters: QuestionFilters, page: number) {
  const where = questionWhere(userId, filters);
  const [total, rows] = await Promise.all([
    db.question.count({ where }),
    db.question.findMany({
      where,
      select: {
        id: true,
        type: true,
        statement: true,
        difficulty: true,
        year: true,
        source: true,
        questionNumber: true,
        ownerId: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
        examBoard: { select: { name: true } },
        competition: { select: { name: true } },
        states: { where: { userId }, select: { attempts: true, lastCorrect: true, favorite: true, reviewLater: true } },
      },
      orderBy: questionOrder(filters),
      skip: (page - 1) * QUESTION_PAGE_SIZE,
      take: QUESTION_PAGE_SIZE,
    }),
  ]);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)),
    items: rows.map(({ states, ...r }) => ({ ...r, state: states[0] ?? null })),
  };
}

export async function getQuestionFilterOptions(userId: string, subjectId?: string) {
  const visible = { OR: [{ ownerId: null }, { ownerId: userId }] };
  const [enrollments, boards, papers, years, subjects, topics] = await Promise.all([
    db.studentCompetition.findMany({ where: { userId, status: { not: "ARCHIVED" } }, select: { competition: { select: { id: true, name: true } } } }),
    db.examBoard.findMany({ where: { questions: { some: visible } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.examPaper.findMany({ where: { questions: { some: { ownerId: null } } }, select: { id: true, title: true }, orderBy: [{ competition: { name: "asc" } }, { year: "desc" }, { version: "asc" }] }),
    db.question.findMany({ where: { ...visible, year: { not: null } }, distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } }),
    db.subject.findMany({ where: { ...visible, questions: { some: visible } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    subjectId
      ? db.topic.findMany({
          where: { subjectId, OR: [{ ownerId: null }, { ownerId: userId }] },
          select: { id: true, name: true, parentId: true, order: true },
          orderBy: [{ order: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const roots = topics.filter((t) => !t.parentId);
  const orderedTopics = roots.flatMap((r) => [
    { id: r.id, name: r.name },
    ...topics.filter((t) => t.parentId === r.id).map((c) => ({ id: c.id, name: `${r.name} › ${c.name}` })),
  ]);
  return {
    competitions: enrollments.map((e) => e.competition),
    boards,
    papers: papers.map((p) => ({ id: p.id, name: p.title })),
    years: years.map((y) => y.year!).filter(Boolean),
    subjects,
    topics: orderedTopics,
  };
}

/** The question as shown before answering: options WITHOUT the correct flag. */
export async function getQuestionForPractice(userId: string, id: string) {
  const q = await db.question.findFirst({
    where: { id, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: {
      id: true,
      type: true,
      statement: true,
      difficulty: true,
      year: true,
      source: true,
      sourceReference: true,
      figures: true,
      aiModel: true,
      ownerId: true,
      subjectId: true,
      topicId: true,
      subject: { select: { name: true } },
      topic: { select: { name: true, parent: { select: { name: true } } } },
      examBoard: { select: { name: true } },
      competition: { select: { name: true } },
      options: { select: { id: true, label: true, text: true }, orderBy: { order: "asc" } },
      states: { where: { userId }, select: { attempts: true, lastCorrect: true, favorite: true, reviewLater: true } },
      flashcards: { where: { userId }, select: { id: true }, take: 1 },
    },
  });
  if (!q) return null;
  const { states, flashcards, ...rest } = q;
  return { ...rest, state: states[0] ?? null, flashcardId: flashcards[0]?.id ?? null, owned: q.ownerId === userId };
}

export async function nextQuestionId(userId: string, filters: QuestionFilters, currentId: string) {
  const where = questionWhere(userId, filters);
  if (filters.prova) {
    const current = await db.question.findUnique({ where: { id: currentId }, select: { questionNumber: true } });
    const after = current?.questionNumber ?? 0;
    const next = await db.question.findFirst({ where: { AND: [where, { questionNumber: { gt: after } }] }, select: { id: true }, orderBy: questionOrder(filters) });
    return next?.id ?? null;
  }
  const next = await db.question.findFirst({ where: { AND: [where, { id: { gt: currentId } }] }, select: { id: true }, orderBy: { id: "asc" } });
  if (next) return next.id;
  const first = await db.question.findFirst({ where: { AND: [where, { id: { not: currentId } }] }, select: { id: true }, orderBy: { id: "asc" } });
  return first?.id ?? null;
}

export async function getOwnedQuestion(userId: string, id: string) {
  return db.question.findFirst({
    where: { id, ownerId: userId },
    include: { options: { orderBy: { order: "asc" } } },
  });
}

/** Leaf-and-parent topics of a subject for authoring forms. */
export async function getAuthoringOptions(userId: string) {
  const visible = { OR: [{ ownerId: null }, { ownerId: userId }] };
  const [subjects, boards, enrollments] = await Promise.all([
    db.subject.findMany({
      where: visible,
      select: { id: true, name: true, topics: { where: visible, select: { id: true, name: true, parentId: true, order: true }, orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.examBoard.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.studentCompetition.findMany({ where: { userId, status: { not: "ARCHIVED" } }, select: { competition: { select: { id: true, name: true } } } }),
  ]);
  return {
    subjects: subjects.map((s) => {
      const roots = s.topics.filter((t) => !t.parentId);
      return {
        id: s.id,
        name: s.name,
        topics: roots.flatMap((r) => [
          { id: r.id, name: r.name },
          ...s.topics.filter((t) => t.parentId === r.id).map((c) => ({ id: c.id, name: `${r.name} › ${c.name}` })),
        ]),
      };
    }),
    boards,
    competitions: enrollments.map((e) => e.competition),
  };
}
