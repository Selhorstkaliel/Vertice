import "server-only";
import { db } from "@/lib/db";
import type { ExtractedFields } from "@/engines/editais/fields";

export function parseFields(value: unknown): ExtractedFields {
  return value && typeof value === "object" ? (value as ExtractedFields) : {};
}

/**
 * What is in force for a competition: approved fields of every published
 * edital/retificação in publication order, with approved retificação changes
 * applied on top. This is what a new retificação is compared with.
 */
export async function currentPublishedFields(competitionId: string) {
  const docs = await db.editalDocument.findMany({
    where: { competitionId, status: "PUBLISHED", extraction: { publishedAt: { not: null } } },
    select: { id: true, type: true, url: true, title: true, extraction: { select: { fields: true, publishedAt: true } }, changes: { where: { status: "APPROVED" } } },
    orderBy: { extraction: { publishedAt: "asc" } },
  });
  const out: Record<string, { value: unknown; label: string; documentId: string; documentUrl: string; documentTitle: string }> = {};
  for (const d of docs) {
    const from = { documentId: d.id, documentUrl: d.url, documentTitle: d.title };
    if (d.type === "RETIFICACAO") {
      for (const c of d.changes) out[c.field] = { value: c.after, label: c.label, ...from };
      continue;
    }
    for (const [key, f] of Object.entries(parseFields(d.extraction?.fields))) {
      if (f.status === "APPROVED") out[key] = { value: f.value, label: f.label, ...from };
    }
  }
  return out;
}
