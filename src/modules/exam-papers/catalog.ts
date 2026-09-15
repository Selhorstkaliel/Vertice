import "server-only";
import { db } from "@/lib/db";
import { normalizeName } from "@/engines/questions/answer-key";
import type { CatalogSubject } from "./prompts";

export interface CompetitionCatalog {
  subjects: (CatalogSubject & { id: string })[];
  topicIdByCode: Map<string, { topicId: string; subjectId: string }>;
  subjectIdBySlug: Map<string, string>;
}

/** Subjects and leaf topics of a catalog competition, with short codes for prompts. */
export async function loadCompetitionCatalog(competitionId: string): Promise<CompetitionCatalog> {
  const links = await db.competitionSubject.findMany({
    where: { competitionId },
    orderBy: { order: "asc" },
    select: { subject: { select: { id: true, slug: true, name: true, topics: { where: { ownerId: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true } } } } },
  });
  const topicIdByCode = new Map<string, { topicId: string; subjectId: string }>();
  const subjectIdBySlug = new Map<string, string>();
  let counter = 0;
  const subjects = links.map(({ subject }) => {
    subjectIdBySlug.set(subject.slug, subject.id);
    const names = new Map(subject.topics.map((t) => [t.id, t.name]));
    const parents = new Set(subject.topics.map((t) => t.parentId).filter(Boolean));
    const topics = subject.topics
      .filter((t) => !parents.has(t.id))
      .map((t) => {
        const code = `T${++counter}`;
        topicIdByCode.set(code, { topicId: t.id, subjectId: subject.id });
        return { code, path: t.parentId ? `${names.get(t.parentId)} › ${t.name}` : t.name };
      });
    return { id: subject.id, slug: subject.slug, name: subject.name, topics };
  });
  return { subjects, topicIdByCode, subjectIdBySlug };
}

/** Subject for an extracted question: the model's slug, else the paper section name. */
export function matchSubject(catalog: CompetitionCatalog, slug: string, sectionName?: string | null) {
  const bySlug = catalog.subjectIdBySlug.get(slug.trim().toLowerCase());
  if (bySlug) return bySlug;
  for (const candidate of [slug, sectionName]) {
    if (!candidate) continue;
    const wanted = normalizeName(candidate);
    const found = catalog.subjects.find((s) => normalizeName(s.name) === wanted || normalizeName(s.name).startsWith(wanted.slice(0, 5)));
    if (found) return found.id;
  }
  return null;
}
