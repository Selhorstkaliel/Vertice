/**
 * Calibrates the essay correction against human grades, for each candidate model.
 *
 *   npm run redacao:calibrar -- --arquivo=calibracao.json --concurso=espcex
 *   npm run redacao:calibrar -- --arquivo=calibracao.json --concurso=espcex --modelos=claude-sonnet-5-5,claude-opus-5-5 --limite=0.1 --fora-da-faixa=0.2
 *
 * Input file (JSON array), one entry per essay graded by a teacher or with a published grade:
 *   [{ "id": "r1", "tema": { "title": "...", "prompt": "..." }, "texto": "...",
 *      "notaHumana": { "total": 7.5, "criterios": { "<chave>": 2.5 } } }]
 * The criterion keys must match the rubric keys; "criterios" is optional.
 *
 * Every essay is corrected twice per model (as in the app), so this spends real
 * tokens: the cost per correction of each model is part of the report. Usage is
 * logged with refId "calibracao:*" and stays out of the admin cost report.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { calibrationStats, pickModel, type CalibrationCase } from "@/engines/essays/calibration";
import { addUsage, emptyUsage, estimateCostUsd } from "@/modules/ai/usage";
import { claudeConfigured } from "@/modules/ai/claude";
import { runCorrection } from "@/modules/essays/correct";
import { parseCriteria } from "@/modules/essays/service";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const fileSchema = z.array(
  z.object({
    id: z.string().min(1),
    tema: z.object({ title: z.string(), prompt: z.string() }).nullable().optional(),
    texto: z.string().min(50),
    notaHumana: z.object({ total: z.number(), criterios: z.record(z.number()).optional() }),
  }),
);

async function main() {
  const file = arg("arquivo");
  const slug = arg("concurso");
  if (!file || !slug) {
    console.error("Uso: npm run redacao:calibrar -- --arquivo=<json> --concurso=<slug> [--modelos=a,b] [--limite=0.1] [--fora-da-faixa=0.2]");
    process.exit(2);
  }
  if (!claudeConfigured()) {
    console.error("ANTHROPIC_API_KEY não configurada.");
    process.exit(2);
  }
  const models = (arg("modelos") ?? "claude-sonnet-5-5,claude-opus-5-5").split(",").map((m) => m.trim()).filter(Boolean);
  const maxErrorShare = Number(arg("limite") ?? "0.1");
  const maxOutsideShare = Number(arg("fora-da-faixa") ?? "0.2");

  const essays = fileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const competition = await db.competition.findFirst({ where: { slug, ownerId: null }, select: { id: true, name: true } });
  if (!competition) throw new Error(`Concurso ${slug} não encontrado.`);
  // Calibration runs before publication too: the latest rubric, published or not.
  const rubric = await db.essayRubric.findFirst({ where: { competitionId: competition.id }, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }] });
  if (!rubric) throw new Error(`O concurso ${competition.name} não tem rubrica cadastrada.`);
  const criteria = parseCriteria(rubric.criteria);
  const criteriaMax = Object.fromEntries(criteria.map((c) => [c.key, c.maxScore]));
  const rubricInput = { ...rubric, competitionName: competition.name, criteria };

  console.log(`Rubrica ${competition.name} ${rubric.year ?? ""} (${rubric.verified ? "verificada" : "NÃO verificada"}), ${criteria.length} critérios.`);
  console.log(`${essays.length} redações × ${models.length} modelos × 2 correções = ${essays.length * models.length * 2} chamadas.\n`);

  const results = [];
  for (const model of models) {
    const cases: CalibrationCase[] = [];
    let failures = 0;
    for (const e of essays) {
      try {
        const r = await runCorrection({ userId: null, essayId: `calibracao:${e.id}`, model, rubric: rubricInput, theme: e.tema ?? null, text: e.texto });
        const usage = r.usage.reduce(addUsage, emptyUsage());
        cases.push({
          id: e.id,
          maxScore: r.combined.maxScore,
          human: { total: e.notaHumana.total, criteria: e.notaHumana.criterios },
          ai: {
            totalMin: r.combined.totalMin,
            totalMax: r.combined.totalMax,
            totalMid: r.combined.totalMid,
            disagreement: r.combined.disagreement,
            criteria: Object.fromEntries(r.combined.scores.map((s) => [s.key, s.score])),
            criteriaMax,
          },
          costUsd: estimateCostUsd(model, usage),
        });
        process.stdout.write(".");
      } catch (err) {
        failures++;
        process.stdout.write("x");
        console.error(`\n[${model}] ${e.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const stats = calibrationStats(cases);
    results.push({ model, stats, failures, cases });
    console.log(`\n\n${model}`);
    console.log(`  redações corrigidas: ${stats.cases} (falhas: ${failures})`);
    console.log(`  diferença média no total: ${stats.meanAbsTotal.toFixed(2)} pontos (${(stats.meanAbsTotalShare * 100).toFixed(1)}% da nota máxima)`);
    for (const c of stats.perCriterion) console.log(`  critério ${c.key}: diferença média ${c.meanAbs.toFixed(2)} (${(c.meanAbsShare * 100).toFixed(1)}%), ${c.cases} redações`);
    console.log(`  nota humana fora da faixa estimada: ${stats.outsideRange} de ${stats.cases} (${(stats.outsideRangeShare * 100).toFixed(0)}%)`);
    console.log(`  variação média entre as duas correções: ${(stats.meanDisagreement * 100).toFixed(1)}% da nota máxima`);
    console.log(`  custo médio por correção (duas chamadas): ${stats.meanCostUsd === null ? "preço do modelo não cadastrado" : `US$ ${stats.meanCostUsd.toFixed(4)}`}`);
  }

  const chosen = pickModel(results, { maxErrorShare, maxOutsideShare });
  console.log(`\nLimites: erro médio ≤ ${(maxErrorShare * 100).toFixed(0)}% da nota máxima e nota humana fora da faixa em ≤ ${(maxOutsideShare * 100).toFixed(0)}% das redações.`);
  console.log(
    chosen
      ? `Modelo mais barato que passou: ${chosen.model}. Defina ESSAY_MODEL=${chosen.model}${env.ESSAY_MODEL === chosen.model ? " (já é o atual)" : ""}.`
      : "Nenhum modelo passou nos limites. Mantenha ESSAYS_ENABLED desligado em produção e revise a rubrica ou os prompts.",
  );

  const out = arg("saida") ?? `calibracao-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(out, JSON.stringify({ rubricId: rubric.id, limits: { maxErrorShare, maxOutsideShare }, chosen: chosen?.model ?? null, results }, null, 2));
  console.log(`Relatório completo salvo em ${out}.`);
  if (!chosen) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
