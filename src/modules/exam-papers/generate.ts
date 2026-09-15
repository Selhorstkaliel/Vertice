import "server-only";
import type { Difficulty, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { normalizeLabel, wordOverlap } from "@/engines/questions/draft-check";
import { figureMarkers } from "@/engines/questions/rich-text";
import { generateJson } from "@/modules/ai/gemini";
import { loadCompetitionCatalog } from "./catalog";
import { evaluateDraft, type DraftVerification } from "./review-check";
import { GENERATION_SCHEMA, GENERATION_SYSTEM, generationPrompt, SOLVE_SCHEMA, SOLVE_SYSTEM, solvePrompt, type GenerationOutput, type SolveOutput } from "./prompts";

export const MAX_GENERATED_PER_RUN = 10;
const EXAMPLES = 6;

const optionsText = (options: { label: string; text: string }[]) => options.map((o) => `${o.label}) ${o.text}`).join("\n");

/**
 * Writes new practice questions in the style of a competition, grounded on its
 * published official questions, then has a separate call solve each one
 * without the answer. Results are drafts: nothing reaches students unreviewed.
 */
export async function generateStyleQuestions(input: { competitionId: string; subjectId: string; topicId: string | null; count: number; difficulty: Difficulty | null }) {
  const count = Math.max(1, Math.min(MAX_GENERATED_PER_RUN, Math.round(input.count)));
  const competition = await db.competition.findFirst({ where: { id: input.competitionId, ownerId: null }, select: { id: true, name: true } });
  if (!competition) throw new DomainError("Concurso não encontrado no catálogo.");
  const catalog = await loadCompetitionCatalog(competition.id);
  const subject = catalog.subjects.find((s) => s.id === input.subjectId);
  if (!subject) throw new DomainError("Esta disciplina não faz parte do concurso escolhido.");
  const topics = subject.topics.filter((t) => !input.topicId || catalog.topicIdByCode.get(t.code)?.topicId === input.topicId);
  if (topics.length === 0) throw new DomainError("Tópico não encontrado nesta disciplina.");

  const official = await db.question.findMany({
    where: { competitionId: competition.id, subjectId: subject.id, source: "OFFICIAL", ownerId: null },
    select: { id: true, statement: true, topicId: true, difficulty: true, year: true, options: { orderBy: { order: "asc" }, select: { label: true, text: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  if (official.length === 0) throw new DomainError(`Publique questões oficiais de ${subject.name} da ${competition.name} antes de gerar questões no estilo da prova.`);
  // Same topic first, then questions without figures (the generator cannot draw), then variety across years.
  const examples = [...official]
    .sort((a, b) => Number(b.topicId === input.topicId) - Number(a.topicId === input.topicId) || figureMarkers(a.statement).length - figureMarkers(b.statement).length)
    .slice(0, EXAMPLES);

  const recent = await db.questionDraft.findMany({ where: { origin: "GENERATED", competitionId: competition.id, subjectId: subject.id }, orderBy: { createdAt: "desc" }, take: 15, select: { statement: true } });

  const generated = await generateJson<GenerationOutput>({
    system: GENERATION_SYSTEM,
    parts: [
      {
        text: generationPrompt({
          competition: competition.name,
          subject: subject.name,
          topics: topics.map((t) => `${t.code}: ${t.path}`).join("\n"),
          count,
          examples: examples.map((q, i) => `#${i + 1} (${competition.name} ${q.year ?? ""}, ${q.difficulty})\n${q.statement}\n${optionsText(q.options)}`).join("\n\n"),
          avoid: recent.map((r) => `- ${r.statement.slice(0, 140)}`).join("\n"),
        }) + (input.difficulty ? `\n\nDificuldade desejada: ${input.difficulty}.` : ""),
      },
    ],
    schema: GENERATION_SCHEMA,
    thinking: "high",
  });
  const questions = generated.data.questions.slice(0, count);
  if (questions.length === 0) throw new DomainError("A IA não devolveu questões. Tente novamente.");

  const solved = await generateJson<SolveOutput>({
    system: SOLVE_SYSTEM,
    parts: [{ text: solvePrompt(questions.map((q, i) => ({ ref: `G${i + 1}`, statement: q.statement, options: optionsText(q.options), officialLabel: null }))) }],
    schema: SOLVE_SCHEMA,
    thinking: "high",
  });

  const created: string[] = [];
  for (const [i, q] of questions.entries()) {
    const solution = solved.data.solutions.find((s) => s.ref.trim().toUpperCase() === `G${i + 1}`);
    const generatorAnswer = normalizeLabel(q.answer) || null;
    const solverAnswer = solution ? normalizeLabel(solution.answer) || null : null;
    const topic = catalog.topicIdByCode.get(q.topic.trim().toUpperCase());
    const closest = examples.map((e) => ({ questionId: e.id, overlap: wordOverlap(q.statement, e.statement) })).sort((x, y) => y.overlap - x.overlap)[0] ?? null;
    const topicId = topic?.subjectId === subject.id ? topic.topicId : input.topicId;
    const verification: DraftVerification = {
      generatorAnswer,
      solverAnswer,
      confidence: solution?.confidence ?? "LOW",
      model: generated.model,
      solverModel: solved.model,
      exampleQuestionIds: examples.map((e) => e.id),
      closestExample: closest,
      styleNote: q.styleNote?.slice(0, 300) ?? null,
    };
    const check = await evaluateDraft({ origin: "GENERATED", number: null, verification: verification as unknown as Prisma.JsonValue, examPaper: null }, { statement: q.statement, options: q.options, correctLabel: generatorAnswer, subjectId: subject.id }, [], false);
    const issues = [...check.issues];
    if (figureMarkers(q.statement).length) issues.push("A questão gerada cita figura, que não existe: reescreva ou rejeite.");
    if (!topicId) issues.push("Escolha o tópico.");
    const draft = await db.questionDraft.create({
      data: {
        origin: "GENERATED",
        competitionId: competition.id,
        statement: q.statement.trim(),
        options: check.options as unknown as Prisma.InputJsonValue,
        correctLabel: check.correctLabel,
        explanation: q.explanation.trim(),
        subjectId: subject.id,
        topicId,
        difficulty: q.difficulty,
        issues,
        aiModel: generated.model,
        verification: verification as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    created.push(draft.id);
  }
  return { created: created.length, requests: generated.requests + solved.requests };
}
