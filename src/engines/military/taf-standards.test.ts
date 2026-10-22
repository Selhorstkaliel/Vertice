import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretTafIndex, modalityOf, onePerTest, secondsOf, standardsForSex } from "./taf-standards";

test("TAF test names map to modalities", () => {
  assert.equal(modalityOf("Corrida de 12 minutos"), "RUN");
  assert.equal(modalityOf("Flexão de braços no solo"), "PUSH_UP");
  assert.equal(modalityOf("Barra fixa"), "PULL_UP");
  assert.equal(modalityOf("Abdominal supra"), "SIT_UP");
  assert.equal(modalityOf("Natação 50 m nado livre"), "SWIM");
  assert.equal(modalityOf("Salto em distância"), "OTHER");
});

test("times written in many ways become seconds", () => {
  assert.equal(secondsOf("12 min"), 720);
  assert.equal(secondsOf("13'30''"), 810);
  assert.equal(secondsOf("13:30"), 810);
  assert.equal(secondsOf("13 min 30 s"), 810);
  assert.equal(secondsOf("45 s"), 45);
  assert.equal(secondsOf("1min30"), 90);
  assert.equal(secondsOf("12 repetições"), null);
});

test("edital indices become measurable targets", () => {
  assert.deepEqual(interpretTafIndex("Flexão de braços", "20", "repetições"), { modality: "PUSH_UP", unit: "REPS", betterWhen: "HIGHER", target: 20, distanceMeters: null });
  assert.deepEqual(interpretTafIndex("Corrida de 12 minutos", "2.400 m em 12 min", "metros"), { modality: "RUN", unit: "METERS", betterWhen: "HIGHER", target: 2400, distanceMeters: null });
  // EsPCEx writes the number and the unit in separate columns.
  assert.deepEqual(interpretTafIndex("Corrida de 12 minutos", "2.450", "metros"), { modality: "RUN", unit: "METERS", betterWhen: "HIGHER", target: 2450, distanceMeters: null });
  assert.deepEqual(interpretTafIndex("Corrida", "3,2", "km"), { modality: "RUN", unit: "METERS", betterWhen: "HIGHER", target: 3200, distanceMeters: null });
  assert.deepEqual(interpretTafIndex("Corrida de 2.400 m", "12'00''", "tempo máximo"), { modality: "RUN", unit: "SECONDS", betterWhen: "LOWER", target: 720, distanceMeters: 2400 });
  assert.deepEqual(interpretTafIndex("Natação 50 m", "50 m em 45 s", "segundos"), { modality: "SWIM", unit: "SECONDS", betterWhen: "LOWER", target: 45, distanceMeters: 50 });
  assert.deepEqual(interpretTafIndex("Barra fixa", "6 repetições", "rep."), { modality: "PULL_UP", unit: "REPS", betterWhen: "HIGHER", target: 6, distanceMeters: null });
  assert.equal(interpretTafIndex("Teste de impulsão", "apto", "conceito").target, null);
});

test("indices for the student's sex, one per test", () => {
  const all = [
    { test: "Corrida", sex: "MALE" as const, order: 0 },
    { test: "Corrida", sex: "MALE" as const, order: 1 },
    { test: "Corrida", sex: "FEMALE" as const, order: 2 },
    { test: "Natação", sex: "BOTH" as const, order: 3 },
  ];
  assert.deepEqual(onePerTest(standardsForSex(all, "MALE")).map((s) => s.order), [0, 3]);
  assert.deepEqual(onePerTest(standardsForSex(all, "FEMALE")).map((s) => s.order), [2, 3]);
});
