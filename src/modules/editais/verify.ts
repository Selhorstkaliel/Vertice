import "server-only";
import type { EditalDocType, EditalSource } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { downloadPublicFile, PublicDownloadError } from "@/lib/public-download";
import { isPdf, saveFile, sha256 } from "@/lib/storage";
import { documentLinks, extractLinks, isFileLink, type PageLink } from "@/engines/editais/links";
import { classifyDocument, READ_TYPES } from "@/engines/editais/classify";
import { robotsAllows } from "@/engines/editais/robots";
import { EDITAL_DOC_TYPE_LABEL } from "@/lib/labels";
import { allowLocalSources, decodeHtml, notifyFollowers } from "./shared";

const PAGE_MAX_BYTES = 8_000_000;
const FILE_MAX_BYTES = 40_000_000;
/** New files downloaded per source per run; the rest wait for the next run. */
const MAX_DOWNLOADS_PER_RUN = 10;
/** Pause between two requests to the same site. */
const POLITE_DELAY_MS = 1500;

export type Log = (message: string) => void;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const robotsCache = new Map<string, string | null>();
const lastHit = new Map<string, number>();

async function politeFetch(url: string, maxBytes: number) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + POLITE_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  return downloadPublicFile(url, { maxBytes, timeoutMs: 60_000, allowPrivate: allowLocalSources() });
}

async function allowedByRobots(url: string) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const txt = await politeFetch(`${u.origin}/robots.txt`, 200_000)
      .then((b) => new TextDecoder().decode(b))
      .catch(() => null);
    robotsCache.set(u.origin, txt);
  }
  return robotsAllows(robotsCache.get(u.origin) ?? null, u.pathname + u.search);
}

async function pageLinks(url: string) {
  if (!(await allowedByRobots(url))) throw new PublicDownloadError(`O robots.txt de ${new URL(url).host} não permite ler esta página.`);
  const html = decodeHtml(await politeFetch(url, PAGE_MAX_BYTES));
  return extractLinks(html, url);
}

function matchesFilter(link: PageLink, filter: string | null) {
  if (!filter) return true;
  const re = new RegExp(filter, "i");
  let decoded = link.url;
  try {
    decoded = decodeURIComponent(link.url);
  } catch {
    // keep the raw address
  }
  return re.test(link.text) || re.test(link.url) || re.test(decoded);
}

/**
 * Links a source offers now: documents on a list page, contest pages (and
 * their documents) on an index. `pageLinks` is the unfiltered count, used to
 * tell a broken page (no links at all) from a list where nothing matches.
 */
async function collectLinks(source: EditalSource, log: Log) {
  const links = await pageLinks(source.url);
  if (source.kind === "LINK_LIST") return { links: documentLinks(links).filter((l) => matchesFilter(l, source.filter)), pageLinks: links.length };
  const own = new URL(source.url);
  // Without a filter, an index only counts sub-pages of itself (never the site menu).
  const ownPrefix = own.pathname.replace(/\.(html?|aspx?|php)$/i, "").replace(/\/$/, "");
  const pages = links.filter((l) => {
    const u = new URL(l.url);
    if (u.toString() === own.toString()) return false;
    if (source.follow) return new RegExp(source.follow, "i").test(u.pathname);
    if (source.filter) return matchesFilter(l, source.filter);
    return u.host === own.host && u.pathname.startsWith(`${ownPrefix}/`);
  });
  const out: PageLink[] = [...pages];
  if (source.follow) {
    for (const p of pages.slice(0, 5)) {
      try {
        out.push(...documentLinks(await pageLinks(p.url)));
      } catch (err) {
        log(`  não foi possível abrir ${p.url}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return { links: out, pageLinks: links.length };
}

export interface CheckReport {
  source: string;
  competition: string;
  found: number;
  new: number;
  baseline: boolean;
  error: string | null;
}

/** Registers one link as a document; downloads files worth reading. Returns the id when it is news. */
async function registerLink(source: EditalSource & { competition: { slug: string; name: string } }, link: PageLink, baseline: boolean, budget: { downloads: number }, log: Log) {
  const c = classifyDocument({ title: link.text, url: link.url });
  const title = (link.text || decodeURIComponent(link.url.split("/").pop() ?? link.url)).slice(0, 300);
  const doc = await db.editalDocument.create({
    data: {
      sourceId: source.id,
      competitionId: source.competitionId,
      url: link.url,
      title,
      type: c.type,
      typedBy: "regras",
      baseline,
      status: baseline ? "IGNORED" : "NEW",
      statusNote: baseline ? "Já existia na primeira verificação desta fonte." : c.confident ? null : "Tipo incerto pelas regras: confira no admin.",
    },
  });
  if (baseline) return null;

  const wantsReading = READ_TYPES.includes(c.type) || !c.confident;
  if (isFileLink(link.url) && wantsReading && budget.downloads > 0) {
    budget.downloads--;
    try {
      const bytes = await politeFetch(link.url, FILE_MAX_BYTES);
      if (!isPdf(bytes)) {
        await db.editalDocument.update({ where: { id: doc.id }, data: { status: "IGNORED", statusNote: "O link não é um PDF (pode ser ZIP ou página): envie o arquivo pelo admin se precisar de leitura." } });
      } else {
        const hash = sha256(bytes);
        const twin = await db.editalDocument.findFirst({ where: { competitionId: source.competitionId, fileHash: hash, id: { not: doc.id } }, select: { id: true, title: true } });
        if (twin) {
          await db.editalDocument.update({ where: { id: doc.id }, data: { fileHash: hash, status: "IGNORED", statusNote: `Mesmo arquivo de “${twin.title}”, já registrado com outro endereço.` } });
          return null;
        }
        const name = await saveFile("editais", `${hash}.pdf`, bytes);
        await db.editalDocument.update({ where: { id: doc.id }, data: { fileHash: hash, filePath: name } });
      }
    } catch (err) {
      await db.editalDocument.update({ where: { id: doc.id }, data: { status: "FAILED", statusNote: `Falha ao baixar: ${err instanceof Error ? err.message : err}` } });
      log(`  falha ao baixar ${link.url}`);
    }
  } else if (!wantsReading) {
    await db.editalDocument.update({ where: { id: doc.id }, data: { status: "IGNORED", statusNote: "Sem leitura completa: só o aviso com o link oficial." } });
  } else if (wantsReading && isFileLink(link.url)) {
    await db.editalDocument.update({ where: { id: doc.id }, data: { statusNote: "Download adiado para a próxima verificação (limite por execução)." } });
  }
  return doc.id;
}

/** The immediate notice: title and official link only, never interpreted data. */
export async function announceDocument(documentId: string) {
  const doc = await db.editalDocument.findUnique({ where: { id: documentId }, include: { competition: { select: { name: true } } } });
  if (!doc || doc.baseline) return 0;
  return notifyFollowers(doc.competitionId, () => [
    {
      type: "EDITAL_DOCUMENT",
      title: `${doc.competition.name}: ${EDITAL_DOC_TYPE_LABEL[doc.type as EditalDocType].toLowerCase()} publicado`,
      body: `${doc.title}. Abra o documento oficial pelo link. Os dados ainda estão em conferência pela equipe do Vértice.`,
      href: doc.url,
      dedupeKey: `edital-doc:${doc.id}`,
    },
  ]);
}

export async function checkSource(sourceId: string, log: Log, opts: { force?: boolean } = {}): Promise<CheckReport | null> {
  const source = await db.editalSource.findUnique({ where: { id: sourceId }, include: { competition: { select: { slug: true, name: true } } } });
  if (!source || !source.active || source.kind === "BROWSER_ONLY") return null;
  const minGap = env.EDITAIS_MIN_INTERVAL_HOURS * 3600_000;
  if (!opts.force && source.lastCheckedAt && Date.now() - source.lastCheckedAt.getTime() < minGap) return null;

  const report: CheckReport = { source: source.url, competition: source.competition.slug, found: 0, new: 0, baseline: !source.lastCheckedAt, error: null };
  try {
    const { links, pageLinks: total } = await collectLinks(source, log);
    report.found = links.length;
    // A page that used to have links and now has none at all is probably broken, not empty.
    if (total === 0 && (source.lastLinkCount ?? 0) > 0) throw new Error(`A página não tem nenhum link, e antes tinha ${source.lastLinkCount}: pode ter mudado de formato ou estar fora do ar.`);
    const known = new Set((await db.editalDocument.findMany({ where: { competitionId: source.competitionId }, select: { url: true } })).map((d) => d.url));
    const budget = { downloads: MAX_DOWNLOADS_PER_RUN };
    const fresh: string[] = [];
    for (const link of links) {
      if (known.has(link.url)) continue;
      known.add(link.url);
      const id = await registerLink(source, link, report.baseline, budget, log);
      if (id) fresh.push(id);
    }
    report.new = report.baseline ? 0 : fresh.length;
    for (const id of fresh) await announceDocument(id);
    await db.editalSource.update({
      where: { id: source.id },
      data: { lastCheckedAt: new Date(), lastLinkCount: total, lastError: null, consecutiveFailures: 0, ...(fresh.length ? { lastNewDocumentAt: new Date() } : {}) },
    });
    log(`${source.competition.slug}: ${links.length} links, ${report.baseline ? `${links.length} registrados como histórico` : `${fresh.length} novos`} (${source.url})`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    await db.editalSource.update({ where: { id: source.id }, data: { lastCheckedAt: new Date(), lastError: report.error.slice(0, 500), consecutiveFailures: { increment: 1 } } });
    log(`${source.competition.slug}: ERRO ${report.error} (${source.url})`);
  }
  return report;
}

export async function checkAllSources(log: Log, opts: { slug?: string; force?: boolean } = {}) {
  const sources = await db.editalSource.findMany({
    where: { active: true, kind: { not: "BROWSER_ONLY" }, ...(opts.slug ? { competition: { slug: opts.slug } } : {}) },
    select: { id: true },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
  });
  const reports: CheckReport[] = [];
  for (const s of sources) {
    const r = await checkSource(s.id, log, opts);
    if (r) reports.push(r);
  }
  return reports;
}

/** Manual upload (sites that only open in a browser): same pipeline as a downloaded file. */
export async function registerManualFile(input: { competitionId: string; bytes: Uint8Array; sourceUrl: string; title: string; announce: boolean }) {
  if (!isPdf(input.bytes)) throw new Error("O arquivo não é um PDF.");
  const hash = sha256(input.bytes);
  const twin = await db.editalDocument.findFirst({ where: { competitionId: input.competitionId, fileHash: hash }, select: { id: true } });
  if (twin) return { id: twin.id, duplicate: true };
  const name = await saveFile("editais", `${hash}.pdf`, input.bytes);
  const c = classifyDocument({ title: input.title, url: input.sourceUrl });
  const existing = await db.editalDocument.findUnique({ where: { competitionId_url: { competitionId: input.competitionId, url: input.sourceUrl } }, select: { id: true } });
  const data = {
    title: input.title.slice(0, 300),
    type: c.type,
    fileHash: hash,
    filePath: name,
    status: READ_TYPES.includes(c.type) || !c.confident ? ("NEW" as const) : ("IGNORED" as const),
    statusNote: "Enviado manualmente pelo admin.",
    baseline: false,
  };
  const doc = existing
    ? await db.editalDocument.update({ where: { id: existing.id }, data })
    : await db.editalDocument.create({ data: { competitionId: input.competitionId, url: input.sourceUrl, ...data } });
  if (input.announce) await announceDocument(doc.id);
  return { id: doc.id, duplicate: false };
}

/**
 * Downloads the file of a document registered without it (history from the
 * first check, or a download postponed), so the admin can have it read.
 */
export async function downloadDocumentFile(documentId: string) {
  const doc = await db.editalDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Documento não encontrado.");
  if (doc.filePath) return { already: true };
  if (!isFileLink(doc.url)) throw new Error("O link não aponta para um PDF: baixe no navegador e use o envio manual.");
  if (!(await allowedByRobots(doc.url))) throw new Error("O robots.txt do site não permite baixar este arquivo.");
  const bytes = await politeFetch(doc.url, FILE_MAX_BYTES);
  if (!isPdf(bytes)) throw new Error("O arquivo baixado não é um PDF.");
  const hash = sha256(bytes);
  const name = await saveFile("editais", `${hash}.pdf`, bytes);
  await db.editalDocument.update({ where: { id: documentId }, data: { fileHash: hash, filePath: name, status: "NEW", statusNote: "Baixado pelo admin para leitura." } });
  return { already: false };
}
