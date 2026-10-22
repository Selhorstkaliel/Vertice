import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlueprint, examDayOf, mixQuota, partMinutes, scaleCounts } from "./blueprint";

test("exam day is read from the paper version", () => {
  assert.equal(examDayOf("1º dia, prova amarela"), 1);
  assert.equal(examDayOf("2° Dia, modelo D"), 2);
  assert.equal(examDayOf("1ª fase, prova objetiva"), null);
  assert.equal(examDayOf("Prova versão A"), null);
});

test("counts scale to the official total by largest remainder", () => {
  assert.deepEqual(scaleCounts([19, 19], 40), [20, 20]);
  assert.deepEqual(scaleCounts([10, 5, 4], 20), [11, 5, 4]);
  assert.equal(scaleCounts([3, 3, 3], 10).reduce((a, n) => a + n, 0), 10);
});

test("papers of the latest year become one part per exam day; other colors of the same day are ignored", () => {
  const bp = buildBlueprint({
    papers: [
      { id: "a", year: 2025, version: "1º dia, prova amarela", expectedCount: 40, subjects: [{ subjectId: "mat", questions: 40 }] },
      { id: "b", year: 2026, version: "2º dia, prova azul", expectedCount: 50, subjects: [{ subjectId: "por", questions: 24 }, { subjectId: "ing", questions: 24 }] },
      { id: "c", year: 2026, version: "1º dia, prova azul", expectedCount: 40, subjects: [{ subjectId: "mat", questions: 38 }] },
      { id: "d", year: 2026, version: "1º dia, prova rosa", expectedCount: 40, subjects: [{ subjectId: "mat", questions: 40 }] },
    ],
  })!;
  assert.equal(bp.source, "PAPERS");
  assert.equal(bp.year, 2026);
  assert.deepEqual(bp.parts.map((p) => [p.key, p.day, p.total]), [["dia-1", 1, 40], ["dia-2", 2, 50]]);
  assert.deepEqual(bp.parts[1]!.subjects, [{ subjectId: "por", questions: 25 }, { subjectId: "ing", questions: 25 }]);
});

test("a lone misfiled question in a long paper is not a section; its slot goes to the real ones", () => {
  const bp = buildBlueprint({ papers: [{ id: "a", year: 2025, version: "1º dia", expectedCount: 40, subjects: [{ subjectId: "por", questions: 1 }, { subjectId: "ing", questions: 17 }, { subjectId: "mat", questions: 22 }] }] })!;
  assert.deepEqual(bp.parts[0]!.subjects, [{ subjectId: "ing", questions: 17 }, { subjectId: "mat", questions: 23 }]);
});

test("without days, each booklet of the latest year is its own part", () => {
  const bp = buildBlueprint({
    papers: [
      { id: "a", year: 2023, version: "Auditor-Fiscal", expectedCount: 80, subjects: [{ subjectId: "x", questions: 78 }] },
      { id: "b", year: 2023, version: "Analista-Tributário", expectedCount: 70, subjects: [{ subjectId: "x", questions: 69 }] },
    ],
  })!;
  assert.deepEqual(bp.parts.map((p) => [p.label, p.total]), [["Analista-Tributário", 70], ["Auditor-Fiscal", 80]]);
});

test("an edital rule with counts and days takes precedence over papers", () => {
  const bp = buildBlueprint({
    papers: [{ id: "a", year: 2026, version: "Prova", expectedCount: 10, subjects: [{ subjectId: "mat", questions: 10 }] }],
    rule: { year: 2027, subjects: [{ subjectId: "mat", weight: 2, questions: 20, day: 1 }, { subjectId: "fis", weight: 1, questions: 12, day: 2 }, { subjectId: "qui", weight: 1, questions: 12, day: 2 }] },
  })!;
  assert.equal(bp.source, "EDITAL");
  assert.deepEqual(bp.parts.map((p) => [p.label, p.total]), [["1º dia", 20], ["2º dia", 24]]);
  // Incomplete counts fall back to the papers.
  assert.equal(buildBlueprint({ papers: [{ id: "a", year: 2026, version: "Prova", expectedCount: 10, subjects: [{ subjectId: "mat", questions: 10 }] }], rule: { year: 2027, subjects: [{ subjectId: "mat", weight: 1, questions: null }] } })!.source, "PAPERS");
});

test("questions mix half official and half generated, each side covering the other's shortfall", () => {
  assert.deepEqual(mixQuota(10, 50, 50), { official: 5, generated: 5, missing: 0 });
  assert.deepEqual(mixQuota(9, 50, 50), { official: 5, generated: 4, missing: 0 });
  assert.deepEqual(mixQuota(10, 50, 2), { official: 8, generated: 2, missing: 0 });
  assert.deepEqual(mixQuota(10, 3, 50), { official: 3, generated: 7, missing: 0 });
  assert.deepEqual(mixQuota(10, 3, 2), { official: 3, generated: 2, missing: 5 });
});

test("official time per day when the edital gives it, estimate otherwise", () => {
  const part = { key: "dia-2", label: "2º dia", day: 2, subjects: [], total: 50 };
  assert.deepEqual(partMinutes(part, { durationMinutes: null, days: [{ day: 2, durationMinutes: 270 }] }, 2), { minutes: 270, estimated: false });
  assert.deepEqual(partMinutes({ ...part, day: null, key: "prova" }, { durationMinutes: 240 }, 1), { minutes: 240, estimated: false });
  assert.deepEqual(partMinutes(part, null, 2), { minutes: 150, estimated: true });
});
