/**
 * Revisão em lote dos recortes automáticos de figura: monta folhas de contato
 * com as figuras pendentes para conferir várias de uma vez.
 *
 *   npm run figuras -- folha <n>      # monta uma folha de contato com 12 figuras (lote n, começando em 1)
 *   npm run figuras -- aprovar <ids>  # publica os rascunhos informados (ids separados por vírgula)
 *   npm run figuras -- pagina <id>    # imprime a página da prova de onde a figura foi recortada
 */
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { db } from "@/lib/db";
import { loadFile } from "@/lib/storage";
import { saveDraft, type DraftEdit } from "@/modules/exam-papers/service";
import type { DraftFigure } from "@/modules/exam-papers/review-check";
import type { DraftOption } from "@/engines/questions/draft-check";

const POR_FOLHA = 12;
const ARQUIVO_PULADAS = "figuras-para-ajustar.json";
const CELULA = 460;

const [comando, arg] = process.argv.slice(2);

/** Recortes marcados para ajuste manual: saem das folhas seguintes. */
async function puladas(): Promise<string[]> {
  return await readFile(ARQUIVO_PULADAS, "utf8").then((t) => JSON.parse(t) as string[], () => []);
}

async function pular(ids: string[]) {
  const atual = new Set(await puladas());
  for (const id of ids) atual.add(id);
  await writeFile(ARQUIVO_PULADAS, JSON.stringify([...atual], null, 1));
  console.log(`${ids.length} marcada(s) para ajuste; ${atual.size} no total.`);
}

/** Rascunhos cuja única pendência é conferir o recorte automático da figura. */
async function pendentesDeRecorte() {
  const drafts = await db.questionDraft.findMany({
    where: { status: "PENDING", origin: "EXTRACTED", hasFigure: true },
    orderBy: [{ examPaperId: "asc" }, { number: "asc" }],
    select: { id: true, number: true, issues: true, figures: true, statement: true, examPaper: { select: { title: true } } },
  });
  const pular = new Set(await puladas());
  return drafts.filter((d) => d.issues.length === 1 && d.issues[0]!.startsWith("Confira o recorte") && !pular.has(d.id));
}

async function folha(lote: number) {
  const todos = await pendentesDeRecorte();
  const inicio = (lote - 1) * POR_FOLHA;
  const fatia = todos.slice(inicio, inicio + POR_FOLHA);
  if (fatia.length === 0) {
    console.log(`Sem figuras no lote ${lote}. Total pendente: ${todos.length}.`);
    return;
  }

  const colunas = 4;
  const linhas = Math.ceil(fatia.length / colunas);
  const canvas = createCanvas(colunas * CELULA, linhas * (CELULA + 46));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mapa: { indice: number; id: string; prova: string; questao: number }[] = [];
  for (const [i, d] of fatia.entries()) {
    const figura = ((d.figures as DraftFigure[] | null) ?? [])[0];
    const x = (i % colunas) * CELULA;
    const y = Math.floor(i / colunas) * (CELULA + 46);
    ctx.fillStyle = "#111111";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`${inicio + i + 1}. ${(d.examPaper?.title ?? "").slice(0, 34)} q${d.number}`, x + 8, y + 26);

    if (figura?.file) {
      try {
        const img = await loadImage(Buffer.from(await loadFile("figuras", figura.file)));
        const escala = Math.min((CELULA - 16) / img.width, CELULA / img.height, 1);
        ctx.drawImage(img, x + 8, y + 38, img.width * escala, img.height * escala);
      } catch {
        ctx.fillText("(imagem não carregou)", x + 8, y + 80);
      }
    } else {
      ctx.fillText("(sem arquivo)", x + 8, y + 80);
    }
    ctx.strokeStyle = "#cccccc";
    ctx.strokeRect(x + 4, y + 34, CELULA - 8, CELULA);
    mapa.push({ indice: inicio + i + 1, id: d.id, prova: d.examPaper?.title ?? "", questao: d.number ?? 0 });
  }

  await writeFile(`folha-${lote}.png`, canvas.toBuffer("image/png"));
  await writeFile(`folha-${lote}.json`, JSON.stringify(mapa, null, 1));
  console.log(`folha-${lote}.png · ${fatia.length} figuras · ${todos.length} pendentes no total`);
}

async function aprovar(ids: string[]) {
  let ok = 0;
  for (const id of ids) {
    const d = await db.questionDraft.findUniqueOrThrow({
      where: { id },
      select: { statement: true, options: true, correctLabel: true, explanation: true, subjectId: true, topicId: true, difficulty: true, figures: true, number: true },
    });
    const edit: DraftEdit = {
      statement: d.statement,
      options: d.options as unknown as DraftOption[],
      correctLabel: d.correctLabel,
      explanation: d.explanation,
      subjectId: d.subjectId,
      topicId: d.topicId,
      difficulty: d.difficulty,
      figureDescriptions: ((d.figures as DraftFigure[] | null) ?? []).map((f) => f.description ?? ""),
    };
    try {
      await saveDraft(id, edit, true);
      ok++;
    } catch (err) {
      console.log(`⚠ questão ${d.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${ok} de ${ids.length} publicada(s).`);
}

async function pagina(id: string) {
  const d = await db.questionDraft.findUniqueOrThrow({ where: { id }, select: { number: true, statement: true, figures: true, examPaper: { select: { title: true } } } });
  const figuras = (d.figures as DraftFigure[] | null) ?? [];
  console.log(`${d.examPaper?.title ?? ""} · questão ${d.number}`);
  console.log(`figuras: ${JSON.stringify(figuras.map((f) => ({ page: f.page, box: f.box, file: f.file })))}`);
  console.log(`enunciado: ${d.statement.replace(/\s+/g, " ").slice(0, 400)}`);
}

async function main() {
  if (comando === "folha") await folha(Number(arg ?? 1));
  else if (comando === "aprovar") await aprovar((arg ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  else if (comando === "pular") await pular((arg ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  else if (comando === "pagina") await pagina(arg!);
  else console.log("uso: folha <n> | aprovar <ids> | pagina <id>");
}

await main();
await db.$disconnect();
