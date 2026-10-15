import "server-only";
import { db } from "@/lib/db";
import { computeIncidence, type TopicIncidence } from "@/engines/study/incidence";

export interface CompetitionIncidence {
  competitionId: string;
  /** Catalog competition the official questions belong to (a customized edital points to its origin). */
  sourceCompetitionId: string;
  papers: number;
  yearFrom: number | null;
  yearTo: number | null;
  questions: number;
  byTopic: Map<string, TopicIncidence>;
  /** Papers each topic appeared in, so parent topics can show a union. */
  topicPapers: Map<string, Set<string>>;
  subjectPapers: Map<string, number>;
}

/**
 * Official-question incidence for each competition. Only questions with
 * source OFFICIAL from published papers count; AI-generated questions never do.
 */
export async function getOfficialIncidence(competitionIds: string[]): Promise<Map<string, CompetitionIncidence>> {
  const out = new Map<string, CompetitionIncidence>();
  if (competitionIds.length === 0) return out;

  const competitions = await db.competition.findMany({
    where: { id: { in: competitionIds } },
    select: {
      id: true,
      forkedFromId: true,
      topics: { select: { topicId: true, topic: { select: { parentId: true, subjectId: true } } } },
    },
  });
  const sourceIds = [...new Set(competitions.map((c) => c.forkedFromId ?? c.id))];

  const [rows, papers] = await Promise.all([
    db.question.groupBy({
      by: ["competitionId", "subjectId", "topicId", "examPaperId"],
      where: { competitionId: { in: sourceIds }, source: "OFFICIAL", examPaper: { status: "PUBLISHED" } },
      _count: { _all: true },
    }),
    db.examPaper.findMany({
      where: { competitionId: { in: sourceIds }, status: "PUBLISHED", questions: { some: { source: "OFFICIAL" } } },
      select: { id: true, competitionId: true, year: true },
    }),
  ]);

  for (const c of competitions) {
    const sourceId = c.forkedFromId ?? c.id;
    const own = rows.filter((r) => r.competitionId === sourceId);
    const ownPapers = papers.filter((p) => p.competitionId === sourceId);
    const years = ownPapers.map((p) => p.year);

    const questionsByTopic = new Map<string, number>();
    const topicPapers = new Map<string, Set<string>>();
    const papersBySubject = new Map<string, Set<string>>();
    let total = 0;
    for (const r of own) {
      const n = r._count._all;
      total += n;
      if (r.examPaperId) {
        const s = papersBySubject.get(r.subjectId) ?? new Set<string>();
        s.add(r.examPaperId);
        papersBySubject.set(r.subjectId, s);
      }
      if (!r.topicId) continue;
      questionsByTopic.set(r.topicId, (questionsByTopic.get(r.topicId) ?? 0) + n);
      if (r.examPaperId) {
        const s = topicPapers.get(r.topicId) ?? new Set<string>();
        s.add(r.examPaperId);
        topicPapers.set(r.topicId, s);
      }
    }

    const parents = new Set(c.topics.map((t) => t.topic.parentId).filter((id): id is string => !!id));
    const leaves = c.topics.filter((t) => !parents.has(t.topicId));
    const subjectPapers = new Map([...papersBySubject].map(([k, v]) => [k, v.size]));
    const byTopic = computeIncidence({
      topics: leaves.map((t) => ({
        topicId: t.topicId,
        subjectId: t.topic.subjectId,
        questions: questionsByTopic.get(t.topicId) ?? 0,
        papers: topicPapers.get(t.topicId)?.size ?? 0,
      })),
      totalQuestions: total,
      subjectPapers,
    });

    out.set(c.id, {
      competitionId: c.id,
      sourceCompetitionId: sourceId,
      papers: ownPapers.length,
      yearFrom: years.length ? Math.min(...years) : null,
      yearTo: years.length ? Math.max(...years) : null,
      questions: total,
      byTopic,
      topicPapers,
      subjectPapers,
    });
  }
  return out;
}

/** "Baseado em 4 provas oficiais (2025 a 2026)" — null when there is nothing to base it on. */
export function incidenceBasis(i: Pick<CompetitionIncidence, "papers" | "yearFrom" | "yearTo"> | undefined | null): string | null {
  if (!i || i.papers === 0) return null;
  const years = i.yearFrom === i.yearTo ? `ano ${i.yearFrom}` : `anos ${i.yearFrom} a ${i.yearTo}`;
  return `Baseado em ${i.papers} ${i.papers === 1 ? "prova oficial" : "provas oficiais"} (${years})`;
}
