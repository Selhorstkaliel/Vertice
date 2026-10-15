import "server-only";
import type { EditalDocStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parseFields } from "./published";

export const DOC_FILTERS = [
  { value: "revisao", label: "Em revisão", where: { status: "REVIEW" } },
  { value: "leitura", label: "Aguardando leitura", where: { status: { in: ["NEW", "READING"] } } },
  { value: "falhas", label: "Com falha", where: { status: "FAILED" } },
  { value: "publicados", label: "Publicados", where: { status: "PUBLISHED" } },
  { value: "avisos", label: "Só aviso", where: { status: "IGNORED", baseline: false } },
  { value: "historico", label: "Histórico", where: { baseline: true } },
] as const satisfies readonly { value: string; label: string; where: Prisma.EditalDocumentWhereInput }[];

export type DocFilter = (typeof DOC_FILTERS)[number]["value"];
export const parseDocFilter = (v: string | undefined): DocFilter => (DOC_FILTERS.some((f) => f.value === v) ? (v as DocFilter) : "revisao");

/** Sources that need attention: broken N times in a row, or with a recent error. */
export async function sourceAlerts() {
  const failing = await db.editalSource.findMany({
    where: { active: true, OR: [{ consecutiveFailures: { gte: 1 } }, { lastError: { not: null } }] },
    include: { competition: { select: { name: true } } },
    orderBy: { consecutiveFailures: "desc" },
  });
  const failedReads = await db.editalDocument.count({ where: { status: "FAILED" } });
  return {
    failing: failing.map((s) => ({ ...s, needsAttention: s.consecutiveFailures >= env.EDITAIS_FAILURES_ALERT })),
    failedReads,
  };
}

export async function adminEditaisOverview(filter: DocFilter, competitionId?: string) {
  const where: Prisma.EditalDocumentWhereInput = { ...DOC_FILTERS.find((f) => f.value === filter)!.where, ...(competitionId ? { competitionId } : {}) };
  const [documents, counts, sources, alerts, competitions] = await Promise.all([
    db.editalDocument.findMany({
      where,
      include: { competition: { select: { name: true } }, extraction: { select: { issues: true, fields: true } }, _count: { select: { changes: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    Promise.all(DOC_FILTERS.map(async (f) => [f.value, await db.editalDocument.count({ where: { ...f.where, ...(competitionId ? { competitionId } : {}) } })] as const)),
    db.editalSource.findMany({ include: { competition: { select: { name: true, slug: true } }, _count: { select: { documents: true } } }, orderBy: [{ competition: { name: "asc" } }, { url: "asc" }] }),
    sourceAlerts(),
    db.competition.findMany({ where: { ownerId: null, forkedFromId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    documents: documents.map((d) => {
      const fields = parseFields(d.extraction?.fields);
      const fieldIssues = Object.values(fields).reduce((a, f) => a + f.issues.length, 0);
      return { ...d, fieldCount: Object.keys(fields).length, issueCount: (d.extraction?.issues.length ?? 0) + fieldIssues };
    }),
    counts: Object.fromEntries(counts) as Record<string, number>,
    sources,
    alerts,
    competitions,
  };
}

export async function adminDocument(id: string) {
  const doc = await db.editalDocument.findUnique({
    where: { id },
    include: {
      competition: { select: { id: true, name: true, slug: true } },
      source: { select: { url: true } },
      extraction: { include: { reviewedBy: { select: { name: true } } } },
      changes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!doc) return null;
  return { ...doc, fields: parseFields(doc.extraction?.fields) };
}

/** Student page: each followed competition, its situation, official links and documents. */
export async function studentEditais(userId: string) {
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      isPrimary: true,
      customExamDate: true,
      keepCustomExamDate: true,
      competition: { select: { id: true, name: true, status: true, verification: true, editalUrl: true, sourceNote: true, examDate: true, forkedFromId: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const catalogIds = enrollments.map((e) => e.competition.forkedFromId ?? e.competition.id);
  const [sources, documents, catalog] = await Promise.all([
    db.editalSource.findMany({ where: { competitionId: { in: catalogIds } }, select: { competitionId: true, url: true, kind: true, lastCheckedAt: true, active: true } }),
    db.editalDocument.findMany({
      where: { competitionId: { in: catalogIds }, baseline: false },
      select: { id: true, competitionId: true, title: true, url: true, type: true, status: true, createdAt: true, publishedAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.competition.findMany({ where: { id: { in: catalogIds } }, select: { id: true, status: true, verification: true, editalUrl: true, sourceNote: true, examDate: true } }),
  ]);
  return enrollments.map((e) => {
    const catalogId = e.competition.forkedFromId ?? e.competition.id;
    const c = catalog.find((x) => x.id === catalogId) ?? e.competition;
    const own = sources.filter((s) => s.competitionId === catalogId);
    const checked = own.map((s) => s.lastCheckedAt).filter((d): d is Date => !!d);
    return {
      enrollmentId: e.id,
      competitionId: e.competition.id,
      catalogId,
      name: e.competition.name,
      isPrimary: e.isPrimary,
      status: c.status,
      verified: c.verification === "VERIFIED",
      editalUrl: c.editalUrl,
      sourceNote: c.sourceNote,
      examDate: c.examDate,
      customExamDate: e.customExamDate,
      keepCustomExamDate: e.keepCustomExamDate,
      lastCheckedAt: checked.length ? new Date(Math.max(...checked.map((d) => d.getTime()))) : null,
      officialPages: own.map((s) => ({ url: s.url, automatic: s.active && s.kind !== "BROWSER_ONLY" })),
      documents: documents.filter((d) => d.competitionId === catalogId).slice(0, 30),
    };
  });
}

export type StudentEditalView = Awaited<ReturnType<typeof studentEditais>>[number];
export const isReadable = (s: EditalDocStatus) => s === "REVIEW" || s === "PUBLISHED";
