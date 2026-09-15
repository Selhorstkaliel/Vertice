import "server-only";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";

/*
 * Downloads public files from government sites the way a browser would.
 * Two quirks of official Brazilian sites are handled without weakening
 * security: servers that omit the intermediate certificate (the missing one is
 * fetched from the address the certificate itself declares, then the chain is
 * verified in full), and header values folded over several lines, which Node's
 * strict HTTP parser rejects. Internal network addresses are refused on every
 * hop, including redirects.
 */

export class PublicDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "PublicDownloadError";
  }
}

const MAX_REDIRECTS = 5;
const intermediates = new Map<string, string>();

function privateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function publicAddress(url: URL) {
  if (!["https:", "http:"].includes(url.protocol)) throw new PublicDownloadError("Use um endereço http ou https.");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new PublicDownloadError(`Não foi possível encontrar o site ${url.hostname}.`);
  if (addresses.some((a) => privateAddress(a.address))) throw new PublicDownloadError("Endereços de rede interna não são permitidos.");
  // Connect to the address that was checked, so DNS cannot change between check and request.
  return addresses[0]!;
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function request(url: URL, address: { address: string; family: number }, options: { ca?: string[]; maxBytes: number; timeoutMs: number; accept: string }): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Vertice/1.0; importador de provas oficiais)", Accept: options.accept },
        // Newer Node asks for every address (all: true) and expects a list back.
        lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) =>
          opts.all ? cb(null, [{ address: address.address, family: address.family }]) : cb(null, address.address, address.family)) as never,
        insecureHTTPParser: true,
        timeout: options.timeoutMs,
        ...(url.protocol === "https:" ? { servername: url.hostname, ...(options.ca ? { ca: options.ca } : {}) } : {}),
      },
      (res) => {
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > options.maxBytes) {
          res.destroy();
          return reject(new PublicDownloadError("O arquivo passa do tamanho máximo."));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            res.destroy();
            reject(new PublicDownloadError("O arquivo passa do tamanho máximo."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new PublicDownloadError("O site demorou demais para responder.")));
    req.on("error", reject);
    req.end();
  });
}

/** Issuer certificate declared by the server's own certificate (Authority Information Access), as PEM. */
async function missingIntermediate(url: URL, address: { address: string; family: number }) {
  const peer = await new Promise<tls.PeerCertificate>((resolve, reject) => {
    const socket = tls.connect({ host: address.address, port: Number(url.port) || 443, servername: url.hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert);
    });
    socket.setTimeout(15_000, () => socket.destroy(new PublicDownloadError("O site demorou demais para responder.")));
    socket.on("error", reject);
  });
  const issuerUrl = peer.infoAccess?.["CA Issuers - URI"]?.[0];
  if (!issuerUrl) return null;
  const cached = intermediates.get(issuerUrl);
  if (cached) return cached;
  const target = new URL(issuerUrl);
  const res = await request(target, await publicAddress(target), { maxBytes: 64_000, timeoutMs: 15_000, accept: "*/*" });
  if (res.status !== 200) return null;
  const body = res.body.toString("latin1");
  const pem = body.includes("BEGIN CERTIFICATE") ? body : new X509Certificate(res.body).toString();
  intermediates.set(issuerUrl, pem);
  return pem;
}

function isChainError(err: unknown) {
  const code = (err as { code?: string })?.code;
  return code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY";
}

export async function downloadPublicFile(rawUrl: string, { maxBytes, timeoutMs = 120_000 }: { maxBytes: number; timeoutMs?: number }) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PublicDownloadError("Endereço inválido.");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const address = await publicAddress(url);
    let res: RawResponse;
    try {
      res = await request(url, address, { maxBytes, timeoutMs, accept: "application/pdf,application/zip,*/*" });
    } catch (err) {
      if (!isChainError(err)) throw err instanceof PublicDownloadError ? err : new PublicDownloadError(`Não foi possível baixar de ${url.hostname}.`);
      const intermediate = await missingIntermediate(url, address).catch(() => null);
      if (!intermediate) throw new PublicDownloadError(`O certificado de ${url.hostname} não pôde ser verificado.`);
      try {
        res = await request(url, address, { maxBytes, timeoutMs, accept: "application/pdf,application/zip,*/*", ca: [...tls.rootCertificates, intermediate] });
      } catch (retryErr) {
        throw retryErr instanceof PublicDownloadError ? retryErr : new PublicDownloadError(`O certificado de ${url.hostname} não pôde ser verificado.`);
      }
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url);
      continue;
    }
    if (res.status !== 200) throw new PublicDownloadError(`O site respondeu ${res.status} para ${url.pathname}.`, res.status);
    return new Uint8Array(res.body);
  }
  throw new PublicDownloadError("Redirecionamentos demais.");
}
