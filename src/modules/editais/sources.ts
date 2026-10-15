import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";

const sourceFileSchema = z.object({
  concursos: z.array(
    z.object({
      concurso: z.string(),
      termosDou: z.array(z.string()).default([]),
      fontes: z.array(
        z.object({
          url: z.string().url(),
          tipo: z.enum(["lista-de-links", "indice", "somente-navegador", "pagina-unica", "arquivo-compactado"]),
          filtro: z.string().optional(),
          seguir: z.string().optional(),
          situacao: z.enum(["ok", "bloqueia-robos", "inacessivel"]),
          observacao: z.string().optional(),
        }),
      ),
    }),
  ),
});

export type SourceFile = z.infer<typeof sourceFileSchema>;

export async function readSourceFile(file = path.join(process.cwd(), "prisma", "fontes-editais.json")) {
  return sourceFileSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

const KIND = { "lista-de-links": "LINK_LIST", "pagina-unica": "LINK_LIST", "arquivo-compactado": "LINK_LIST", indice: "INDEX", "somente-navegador": "BROWSER_ONLY" } as const;

/**
 * Creates or updates the watched sources from the approved list. Only pages
 * the robot can read are active; the others stay listed for manual upload.
 * Admin changes to `active` are kept for sources that already exist.
 */
export async function syncSources(file?: string) {
  const data = await readSourceFile(file);
  const report = { created: 0, updated: 0, missingCompetitions: [] as string[] };
  for (const c of data.concursos) {
    const competition = await db.competition.findFirst({ where: { slug: c.concurso, ownerId: null }, select: { id: true } });
    if (!competition) {
      report.missingCompetitions.push(c.concurso);
      continue;
    }
    for (const f of c.fontes) {
      const kind = f.situacao === "ok" ? KIND[f.tipo] : "BROWSER_ONLY";
      const data = { kind, filter: f.filtro ?? null, follow: f.seguir ?? null, note: [f.situacao !== "ok" ? `Situação: ${f.situacao}.` : null, f.observacao].filter(Boolean).join(" ") || null };
      const existing = await db.editalSource.findUnique({ where: { competitionId_url: { competitionId: competition.id, url: f.url } }, select: { id: true } });
      if (existing) {
        await db.editalSource.update({ where: { id: existing.id }, data });
        report.updated++;
      } else {
        await db.editalSource.create({ data: { competitionId: competition.id, url: f.url, active: kind !== "BROWSER_ONLY", ...data } });
        report.created++;
      }
    }
  }
  return report;
}

/** Search terms per competition for the official gazette (DOU). */
export async function douTerms(file?: string) {
  const data = await readSourceFile(file);
  return new Map(data.concursos.map((c) => [c.concurso, c.termosDou]));
}
