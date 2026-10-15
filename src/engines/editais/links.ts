/**
 * Document links on an official page (pure). Finds anchors in the HTML,
 * resolves them against the page address and keeps the ones that look like
 * published documents: PDF/ZIP files, or links whose text or address names an
 * edital, retificação, aviso, comunicado, convocação or resultado.
 */

export interface PageLink {
  url: string;
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", thinsp: " ", ensp: " ", emsp: " ", ndash: "–", mdash: "—", ordm: "º", ordf: "ª", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô" };

export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const DOC_FILE = /\.(pdf|zip)(?:$|[?#])/i;
const DOC_WORDS = /\b(edita(l|is)|retifica|aviso|comunicado|convoca|resultado|gabarito|instru[cç][oõ]es|cronograma|homologa)/i;

export function extractLinks(html: string, pageUrl: string): PageLink[] {
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!raw || raw.startsWith("#") || /^(mailto|javascript|tel):/i.test(raw)) continue;
    let url: string;
    try {
      const u = new URL(raw, pageUrl);
      if (!["http:", "https:"].includes(u.protocol)) continue;
      u.hash = "";
      url = u.toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: stripTags(m[4] ?? "") });
  }
  return out;
}

/** Links that point to documents rather than to navigation. */
export function documentLinks(links: PageLink[]): PageLink[] {
  return links.filter((l) => DOC_FILE.test(l.url) || DOC_WORDS.test(l.text) || DOC_WORDS.test(decodeURIComponent(l.url.split("/").pop() ?? "")));
}

export const isFileLink = (url: string) => DOC_FILE.test(url);
