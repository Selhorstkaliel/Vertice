import "server-only";
import { db } from "@/lib/db";
import { normalizeName, sameSubject } from "@/engines/questions/answer-key";
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
    const exact = catalog.subjects.find((s) => normalizeName(s.name) === wanted);
    if (exact) return exact.id;
    // O prefixo aproxima "Matematica" de "Matemática", mas só vale quando o nome é de
    // uma disciplina. "Auditor-Fiscal da Receita Federal do Brasil" é o cargo com que a
    // FGV nomeia os blocos do gabarito, e casaria com "Auditoria" pelos cinco primeiros
    // caracteres, carimbando a prova inteira com a disciplina errada.
    if (namesSeveralSubjects(candidate)) continue;
    const found = catalog.subjects.find((s) => normalizeName(s.name).startsWith(wanted.slice(0, 5)));
    if (found) return found.id;
  }
  // As bancas não escrevem o nome da disciplina como o catálogo: "CONHECIMENTOS DE
  // INFORMÁTICA" é "Informática". Só vale quando uma única disciplina corresponde e
  // o nome é de uma disciplina só: um bloco como "Português, Estudos Sociais e
  // Ciências" cobre três, e atribuir a primeira que casa classificaria errado.
  for (const candidate of [slug, sectionName]) {
    if (!candidate || namesSeveralSubjects(candidate)) continue;
    const found = catalog.subjects.filter((s) => sameSubject(s.name, candidate));
    if (found.length === 1) return found[0]!.id;
  }
  return null;
}

/** Palavras que sobram num nome de bloco depois de tirar o que não diz disciplina. */
const FILLER = new Set(["conhecimentos", "nocoes", "prova", "provas", "dia", "lingua", "de", "do", "da", "e", "parte", "caderno", "area", "geral", "basicos", "especificos"]);

function namesSeveralSubjects(name: string) {
  const words = normalizeName(name).split(" ").filter((w) => w.length >= 3 && !FILLER.has(w));
  return words.length > 3;
}
