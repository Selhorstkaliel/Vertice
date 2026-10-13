/**
 * Recorte manual das figuras que a conferência em lote marcou para ajuste.
 *
 *   npm run recorte -- lista                                   # figuras marcadas, com página e caixa atuais
 *   npm run recorte -- pagina <id> [n]                         # renderiza a página com régua de 0 a 1000 (pagina.png)
 *   npm run recorte -- aplicar <id> <fig> <pag> <y0,x0,y1,x1>  # recorta de novo e mostra em recorte.png
 *   npm run recorte -- publicar <ids>                          # publica e tira da lista de ajuste
 *   npm run recorte -- semfigura <ids>                         # tira a figura e o marcador do texto, e publica
 */
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { db } from "@/lib/db";
import { loadFile } from "@/lib/storage";
import { renderPage } from "@/modules/exam-papers/pdf";
import { cropDraftFigure, removeDraftFigure, saveDraft, type DraftEdit } from "@/modules/exam-papers/service";
import type { DraftFigure } from "@/modules/exam-papers/review-check";
import type { DraftOption } from "@/engines/questions/draft-check";

const ARQUIVO = "figuras-para-ajustar.json";
const args = process.argv.slice(2);
const comando = args[0];

async function marcadas(): Promise<string[]> {
  return await readFile(ARQUIVO, "utf8").then((t) => JSON.parse(t) as string[], () => []);
}

async function desmarcar(ids: string[]) {
  const restam = (await marcadas()).filter((id) => !ids.includes(id));
  await writeFile(ARQUIVO, JSON.stringify(restam, null, 1));
  return restam.length;
}

async function carregar(id: string) {
  return await db.questionDraft.findUniqueOrThrow({
    where: { id },
    select: {
      id: true, number: true, statement: true, options: true, correctLabel: true, explanation: true,
      subjectId: true, topicId: true, difficulty: true, figures: true, issues: true,
      examPaper: { select: { id: true, title: true, filePath: true } },
    },
  });
}

async function lista() {
  for (const [i, id] of (await marcadas()).entries()) {
    const d = await carregar(id);
    const figs = ((d.figures as DraftFigure[] | null) ?? []).map((f) => `p${f.page} [${f.box?.join(", ")}]`);
    console.log(`${i + 1}. ${d.examPaper?.title ?? ""} q${d.number} · ${id}`);
    console.log(`   figuras: ${figs.join(" | ") || "nenhuma"}`);
    console.log(`   ${d.statement.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

/** Página inteira com uma régua de 0 a 1000 nos dois eixos: dá para ler a caixa direto da imagem. */
async function pagina(id: string, numero?: number) {
  const d = await carregar(id);
  if (!d.examPaper) throw new Error("Questão sem prova.");
  const figuras = (d.figures as DraftFigure[] | null) ?? [];
  const pag = numero ?? figuras[0]?.page ?? 1;
  const img = await loadImage(Buffer.from(await renderPage(d.examPaper.id, d.examPaper.filePath, pag)));
  const escala = Math.min(1400 / img.width, 1900 / img.height);
  const largura = Math.round(img.width * escala);
  const altura = Math.round(img.height * escala);
  const margem = 44;
  const canvas = createCanvas(largura + margem, altura + margem);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, margem, margem, largura, altura);

  ctx.font = "13px sans-serif";
  for (let v = 0; v <= 1000; v += 50) {
    const forte = v % 100 === 0;
    ctx.strokeStyle = forte ? "rgba(220,0,60,0.45)" : "rgba(0,120,255,0.20)";
    ctx.lineWidth = 1;
    const x = margem + (v / 1000) * largura;
    const y = margem + (v / 1000) * altura;
    ctx.beginPath();
    ctx.moveTo(x, margem);
    ctx.lineTo(x, margem + altura);
    ctx.moveTo(margem, y);
    ctx.lineTo(margem + largura, y);
    ctx.stroke();
    if (forte) {
      ctx.fillStyle = "#c0003c";
      ctx.fillText(String(v), x + 2, 14);
      ctx.fillText(String(v), 2, y + 12);
    }
  }
  await writeFile("pagina.png", canvas.toBuffer("image/png"));
  console.log(`pagina.png · ${d.examPaper.title} q${d.number} · página ${pag}`);
  console.log(`caixas atuais: ${JSON.stringify(figuras.map((f) => ({ page: f.page, box: f.box })))}`);
  console.log(`eixo x = colunas (esquerda→direita), eixo y = linhas (topo→base), ambos de 0 a 1000`);
}

async function aplicar(id: string, indice: number, pag: number, caixa: number[]) {
  const { file } = await cropDraftFigure(id, indice, pag, caixa);
  const img = await loadImage(Buffer.from(await loadFile("figuras", file)));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext("2d").drawImage(img, 0, 0);
  await writeFile("recorte.png", canvas.toBuffer("image/png"));
  const d = await carregar(id);
  console.log(`recorte.png · ${img.width}×${img.height} · pendências: ${d.issues.join(" ") || "nenhuma"}`);
}

function edicao(d: Awaited<ReturnType<typeof carregar>>, figuras = (d.figures as DraftFigure[] | null) ?? []): DraftEdit {
  return {
    statement: d.statement,
    options: d.options as unknown as DraftOption[],
    correctLabel: d.correctLabel,
    explanation: d.explanation,
    subjectId: d.subjectId,
    topicId: d.topicId,
    difficulty: d.difficulty,
    figureDescriptions: figuras.map((f) => f.description ?? ""),
  };
}

async function publicar(ids: string[]) {
  const ok: string[] = [];
  for (const id of ids) {
    const d = await carregar(id);
    try {
      await saveDraft(id, edicao(d), true);
      ok.push(id);
    } catch (err) {
      console.log(`⚠ q${d.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${ok.length} de ${ids.length} publicada(s); ${await desmarcar(ok)} ainda marcada(s).`);
}

/** Quando o recorte não achou figura nenhuma: o texto perde o marcador e a questão segue sem imagem. */
async function semFigura(ids: string[]) {
  const ok: string[] = [];
  for (const id of ids) {
    const antes = await carregar(id);
    const total = ((antes.figures as DraftFigure[] | null) ?? []).length;
    for (let i = total - 1; i >= 0; i--) await removeDraftFigure(id, i);
    const d = await carregar(id);
    const limpa = (t: string) => t.replace(/\[\[FIGURA \d+\]\]/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const edit = edicao(d, []);
    edit.statement = limpa(edit.statement);
    edit.options = edit.options.map((o) => ({ ...o, text: limpa(o.text) }));
    try {
      await saveDraft(id, edit, true);
      ok.push(id);
    } catch (err) {
      console.log(`⚠ q${d.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${ok.length} de ${ids.length} publicada(s) sem figura; ${await desmarcar(ok)} ainda marcada(s).`);
}

const ids = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

async function main() {
  if (comando === "lista") await lista();
  else if (comando === "pagina") await pagina(args[1]!, args[2] ? Number(args[2]) : undefined);
  else if (comando === "aplicar") await aplicar(args[1]!, Number(args[2]), Number(args[3]), args[4]!.split(",").map(Number));
  else if (comando === "publicar") await publicar(ids(args[1]));
  else if (comando === "semfigura") await semFigura(ids(args[1]));
  else console.log("uso: lista | pagina <id> [n] | aplicar <id> <fig> <pag> <y0,x0,y1,x1> | publicar <ids> | semfigura <ids>");
}

await main();
await db.$disconnect();
