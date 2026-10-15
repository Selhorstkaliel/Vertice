import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decodeEntities } from "@/engines/editais/links";
import { classifyDocument } from "@/engines/editais/classify";
import { announceDocument, type Log } from "./verify";
import { douTerms } from "./sources";

/*
 * Complementary source: the official gazette (DOU), through INLABS, the free
 * official access of the Imprensa Nacional (registration with e-mail and
 * password; see https://github.com/Imprensa-Nacional/inlabs). One download per
 * section per day; articles are matched by the terms of each competition.
 * Only the notice with the official link goes out on its own; reading a DOU
 * act needs its PDF uploaded in the admin.
 */

const BASE = "https://inlabs.in.gov.br";
const ORIGIN_HEADER = "736372697074"; // sent by the official INLABS example scripts

export function douConfigured() {
  return !!env.INLABS_EMAIL && !!env.INLABS_SENHA;
}

async function login() {
  const res = await fetch(`${BASE}/logar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", origem: ORIGIN_HEADER },
    body: new URLSearchParams({ email: env.INLABS_EMAIL!, password: env.INLABS_SENHA! }),
    redirect: "manual",
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("inlabs_session_cookie="));
  if (!cookie) throw new Error("INLABS recusou o login: confira INLABS_EMAIL e INLABS_SENHA.");
  return cookie.split(";")[0]!;
}

export interface DouArticle {
  title: string;
  url: string;
  category: string;
  text: string;
}

/** Articles of one section-day zip (pure parsing of the INLABS XML). */
export function parseDouZip(bytes: Uint8Array): DouArticle[] {
  const files = unzipSync(bytes);
  const out: DouArticle[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (!name.toLowerCase().endsWith(".xml")) continue;
    const xml = strFromU8(content);
    const attr = (n: string) => new RegExp(`${n}="([^"]*)"`).exec(xml)?.[1] ?? "";
    const tag = (n: string) => decodeEntities((new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(xml)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const url = attr("pdfPage");
    if (!url) continue;
    out.push({ title: tag("Identifica") || attr("name"), url, category: attr("artCategory"), text: tag("Texto").slice(0, 20_000) });
  }
  return out;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export async function checkDou(log: Log, day = new Date().toISOString().slice(0, 10)) {
  if (!douConfigured()) {
    log("DOU: INLABS_EMAIL e INLABS_SENHA não configurados; pulando.");
    return { found: 0 };
  }
  const cookie = await login();
  const terms = await douTerms();
  const competitions = await db.competition.findMany({ where: { slug: { in: [...terms.keys()] }, ownerId: null }, select: { id: true, slug: true } });
  let found = 0;
  for (const section of ["DO3", "DO3E"]) {
    const res = await fetch(`${BASE}/index.php?p=${day}&dl=${day}-${section}.zip`, { headers: { Cookie: cookie, origem: ORIGIN_HEADER } });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`INLABS respondeu ${res.status} para ${section} de ${day}.`);
    const articles = parseDouZip(new Uint8Array(await res.arrayBuffer()));
    log(`DOU ${section} ${day}: ${articles.length} atos`);
    for (const a of articles) {
      const hay = norm(`${a.title} ${a.category} ${a.text}`);
      if (!/\b(concurso|processo seletivo|exame de admissao|edital)\b/.test(hay)) continue;
      for (const c of competitions) {
        const hit = (terms.get(c.slug) ?? []).some((t) => hay.includes(norm(t)));
        if (!hit) continue;
        const exists = await db.editalDocument.findUnique({ where: { competitionId_url: { competitionId: c.id, url: a.url } }, select: { id: true } });
        if (exists) continue;
        const type = classifyDocument({ title: a.title, firstText: a.text }).type;
        const doc = await db.editalDocument.create({
          data: { competitionId: c.id, url: a.url, title: `DOU: ${a.title}`.slice(0, 300), type, publishedAt: new Date(`${day}T00:00:00Z`), status: "IGNORED", statusNote: "Ato do Diário Oficial: para ler os dados, envie o PDF pelo admin." },
        });
        await announceDocument(doc.id);
        found++;
      }
    }
  }
  return { found };
}
