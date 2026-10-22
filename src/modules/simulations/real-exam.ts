import "server-only";
import { randomInt } from "node:crypto";
import type { ContentSource, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildBlueprint, mixQuota, partMinutes, type Blueprint, type BlueprintPart } from "@/engines/simulations/blueprint";
import { ruleForCompetition } from "@/modules/scoring/service";

/*
 * "Simulado da prova real": each competition's own exam, part by part (day by
 * day), with the real number of questions per subject, the official time and
 * the edital's scoring rule. Questions mix past official exams and questions
 * generated in the board's style (see engines/simulations/blueprint).
 */

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface RealExamPart extends BlueprintPart {
  minutes: number;
  estimatedTime: boolean;
  subjectsView: { subjectId: string; name: string; questions: number; official: number; generated: number; missing: number }[];
  missing: number;
}

export interface RealExamPlan {
  competitionId: string;
  catalogId: string;
  name: string;
  blueprint: Blueprint;
  parts: RealExamPart[];
  rule: { id: string; year: number | null; verified: boolean; mode: "RIGHT_COUNT" | "PENALTY"; wrongPenalty: number | null } | null;
}

export async function realExamPlan(competitionId: string): Promise<RealExamPlan | null> {
  const competition = await db.competition.findUnique({ where: { id: competitionId }, select: { id: true, name: true, forkedFromId: true } });
  if (!competition) return null;
  const catalogId = competition.forkedFromId ?? competition.id;
  const [rule, papers] = await Promise.all([
    ruleForCompetition(competitionId),
    db.examPaper.findMany({ where: { competitionId: catalogId, status: "PUBLISHED" }, select: { id: true, year: true, version: true, expectedCount: true } }),
  ]);
  const counts = papers.length
    ? await db.question.groupBy({ by: ["examPaperId", "subjectId"], where: { examPaperId: { in: papers.map((p) => p.id) } }, _count: { _all: true } })
    : [];
  const blueprint = buildBlueprint({
    papers: papers.map((p) => ({ ...p, subjects: counts.filter((c) => c.examPaperId === p.id).map((c) => ({ subjectId: c.subjectId, questions: c._count._all })) })),
    rule: rule ? { year: rule.year, subjects: rule.subjects } : null,
  });
  if (!blueprint?.parts.length) return null;

  const subjectIds = [...new Set(blueprint.parts.flatMap((p) => p.subjects.map((s) => s.subjectId)))];
  const [subjects, available] = await Promise.all([
    db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
    db.question.groupBy({ by: ["subjectId", "source"], where: { ownerId: null, competitionId: catalogId, subjectId: { in: subjectIds }, source: { in: ["OFFICIAL", "GENERATED"] } }, _count: { _all: true } }),
  ]);
  const name = new Map(subjects.map((s) => [s.id, s.name]));
  const pool = (subjectId: string, source: ContentSource) => available.find((a) => a.subjectId === subjectId && a.source === source)?._count._all ?? 0;

  const parts = blueprint.parts.map((part) => {
    const time = partMinutes(part, rule ? { durationMinutes: rule.durationMinutes, days: rule.days } : null, blueprint.parts.length);
    const subjectsView = part.subjects.map((s) => ({ subjectId: s.subjectId, name: name.get(s.subjectId) ?? "Matéria", questions: s.questions, ...mixQuota(s.questions, pool(s.subjectId, "OFFICIAL"), pool(s.subjectId, "GENERATED")) }));
    return { ...part, minutes: time.minutes, estimatedTime: time.estimated, subjectsView, missing: subjectsView.reduce((a, s) => a + s.missing, 0) };
  });
  return {
    competitionId: competition.id,
    catalogId,
    name: competition.name,
    blueprint,
    parts,
    rule: rule ? { id: rule.id, year: rule.year, verified: rule.verification === "VERIFIED", mode: rule.mode, wrongPenalty: rule.wrongPenalty } : null,
  };
}

/**
 * Questions for one part, subject by subject in the order of the real exam.
 * Per subject: half from past official exams of this competition, half
 * generated for it; a short side is covered by the other, and what is still
 * missing comes from the same subject in other competitions.
 */
export async function drawRealExamPart(userId: string, catalogId: string, part: RealExamPart) {
  const picked = new Set<string>();
  const ordered: string[] = [];
  for (const s of part.subjectsView) {
    const fetch = async (where: Prisma.QuestionWhereInput) => {
      const rows = await db.question.findMany({
        where: { ownerId: null, subjectId: s.subjectId, ...where },
        select: { id: true, states: { where: { userId }, select: { attempts: true } } },
      });
      // Questions the student never answered first.
      const fresh = rows.filter((r) => !r.states[0]?.attempts && !picked.has(r.id)).map((r) => r.id);
      const seen = rows.filter((r) => r.states[0]?.attempts && !picked.has(r.id)).map((r) => r.id);
      return [...shuffle(fresh), ...shuffle(seen)];
    };
    const [official, generated] = await Promise.all([fetch({ source: "OFFICIAL", competitionId: catalogId }), fetch({ source: "GENERATED", competitionId: catalogId })]);
    const mix = mixQuota(s.questions, official.length, generated.length);
    const chosen = [...official.slice(0, mix.official), ...generated.slice(0, mix.generated)];
    chosen.forEach((id) => picked.add(id));
    if (chosen.length < s.questions) {
      const others = await fetch({ source: { in: ["OFFICIAL", "GENERATED"] }, NOT: { competitionId: catalogId } });
      for (const id of others) {
        if (chosen.length >= s.questions) break;
        chosen.push(id);
        picked.add(id);
      }
    }
    ordered.push(...shuffle(chosen));
  }
  return ordered;
}
