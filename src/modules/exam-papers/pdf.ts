import "server-only";
import path from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { fileExists, loadFile, saveFile, type StorageKind } from "@/lib/storage";
import type { Box } from "@/engines/questions/rich-text";
import { refineBox } from "@/engines/questions/figure-box";

/*
 * Server-side PDF work for imported exams: page count, text layer (used only
 * to double-check numbers) and page images for figure crops.
 */

const RENDER_SCALE = 2;

/**
 * Scanned exams store each page as a JBIG2 or JPEG 2000 image, which pdf.js decodes
 * em WebAssembly. Sem este caminho os decodificadores falham e toda página sai em
 * branco, levando junto os recortes das figuras.
 *
 * O caminho é procurado na hora de abrir um PDF, e não ao carregar o módulo: o
 * admin importa este arquivo em telas que nem chegam a abrir prova, e uma falha
 * aqui derrubaria a página inteira.
 */
let cached: string | undefined;

function wasmDir() {
  if (cached) return cached;
  // A raiz do projeto vem primeiro porque é a única que vale em toda camada do
  // Next: no bundle de Server Actions, `import.meta.url` aponta para dentro de
  // .next e `createRequire` nem sempre resolve. PDFJS_WASM_DIR existe para
  // hospedagens que movem node_modules.
  const candidates = [
    process.env.PDFJS_WASM_DIR,
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "wasm"),
    resolveFromModule(),
  ].filter((dir): dir is string => !!dir);

  const found = candidates.find((dir) => {
    try {
      return existsSync(path.join(dir, "jbig2.wasm"));
    } catch {
      return false;
    }
  });
  // Nenhum candidato pôde ser conferido (fs indisponível nesta camada): segue com
  // a raiz do projeto, que é onde o pacote fica numa instalação normal.
  const dir = found ?? candidates[0]!;
  cached = pathToFileURL(dir + path.sep).href;
  return cached;
}

function resolveFromModule() {
  try {
    return path.join(path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "wasm");
  } catch {
    return undefined;
  }
}

async function openPdf(file: string, kind: StorageKind = "provas") {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await loadFile(kind, file));
  const task = pdfjs.getDocument({ data, verbosity: 0, wasmUrl: wasmDir() });
  const doc = await task.promise;
  return Object.assign(doc, { close: () => task.destroy() });
}

export async function pdfPageCount(file: string, kind: StorageKind = "provas") {
  const doc = await openPdf(file, kind);
  try {
    return doc.numPages;
  } finally {
    await doc.close();
  }
}

/** Text layer per page (index 0 = page 1). Scanned exams have OCR text, which may be imperfect or empty. */
export async function pdfPageTexts(file: string, kind: StorageKind = "provas") {
  const doc = await openPdf(file, kind);
  try {
    const texts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return texts;
  } finally {
    await doc.close();
  }
}

export function pageImageName(paperId: string, page: number) {
  return `${paperId.toLowerCase()}-p${page}.png`;
}

/** PNG of one page, rendered once and kept in storage. */
export async function renderPage(paperId: string, file: string, pageNumber: number) {
  const name = pageImageName(paperId, pageNumber);
  if (await fileExists("paginas", name)) return loadFile("paginas", name);
  const doc = await openPdf(file);
  try {
    if (pageNumber < 1 || pageNumber > doc.numPages) throw new Error(`Page ${pageNumber} out of range`);
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // pdfjs accepts a node canvas context at runtime; its types only describe the DOM one.
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
    const png = canvas.toBuffer("image/png");
    await saveFile("paginas", name, png);
    page.cleanup();
    return png;
  } finally {
    await doc.close();
  }
}

/** Tightens an AI-estimated figure box against the page image (see engines/questions/figure-box). */
export async function refineFigureBox(pagePng: Uint8Array, box: Box) {
  const image = await loadImage(Buffer.from(pagePng));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return refineBox({ width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data }, box);
}

/** Cuts a normalized box (0–1000) out of a page image. */
export async function cropImage(pagePng: Uint8Array, box: Box) {
  const image = await loadImage(Buffer.from(pagePng));
  const [y0, x0, y1, x1] = box.map((v) => v / 1000) as unknown as Box;
  const sx = Math.round(x0 * image.width);
  const sy = Math.round(y0 * image.height);
  const width = Math.max(1, Math.round((x1 - x0) * image.width));
  const height = Math.max(1, Math.round((y1 - y0) * image.height));
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(image, sx, sy, width, height, 0, 0, width, height);
  return canvas.toBuffer("image/png");
}
