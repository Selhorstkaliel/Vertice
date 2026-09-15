/**
 * Demonstration extras for the demo account: goals, TAF log, a scheduled
 * simulation and stage dates. Idempotent and deterministic; the account keeps
 * its permanent "dados fictícios" banner.
 *
 *   node --env-file=.env --conditions=react-server --import tsx prisma/demo-extras.ts
 */
import { db } from "@/lib/db";
import { addDays, keyToDbDate, localNow, zonedToUtc } from "@/lib/time";
import { seededRandom } from "@/lib/utils";

const TZ = "America/Sao_Paulo";

export async function seedDemoExtras(userId: string) {
  const rand = seededRandom(20260915);
  const today = localNow(TZ).key;
  const enrollment = await db.studentCompetition.findFirst({ where: { userId, isPrimary: true }, include: { stages: { orderBy: { order: "asc" } } } });

  await db.$transaction([
    db.goal.deleteMany({ where: { userId } }),
    db.militaryTest.deleteMany({ where: { userId } }),
    db.calendarEvent.deleteMany({ where: { userId } }),
  ]);

  await db.goal.createMany({
    data: [
      { userId, kind: "QUESTIONS", period: "WEEKLY", target: 150 },
      { userId, kind: "HOURS", period: "WEEKLY", target: 20 },
      { userId, kind: "FLASHCARDS", period: "DAILY", target: 20 },
      { userId, kind: "SIMULATIONS", period: "MONTHLY", target: 2 },
    ],
  });

  // Eight weeks of TAF marks, improving with noise.
  const tests = [
    { name: "Corrida 2400 m", modality: "RUN" as const, unit: "SECONDS" as const, betterWhen: "LOWER" as const, distanceMeters: 2400, targetValue: 12 * 60, start: 13 * 60 + 50, step: -9, noise: 12 },
    { name: "Barra fixa", modality: "PULL_UP" as const, unit: "REPS" as const, betterWhen: "HIGHER" as const, distanceMeters: null, targetValue: 8, start: 3, step: 0.6, noise: 1 },
    { name: "Flexão de braços", modality: "PUSH_UP" as const, unit: "REPS" as const, betterWhen: "HIGHER" as const, distanceMeters: null, targetValue: 30, start: 19, step: 1.4, noise: 2 },
  ];
  for (const t of tests) {
    const test = await db.militaryTest.create({
      data: { userId, studentCompetitionId: enrollment?.id ?? null, name: t.name, modality: t.modality, unit: t.unit, betterWhen: t.betterWhen, distanceMeters: t.distanceMeters, targetValue: t.targetValue },
    });
    for (let week = 0; week < 8; week++) {
      const raw = t.start + t.step * week + (rand() - 0.5) * t.noise;
      const value = t.unit === "REPS" ? Math.max(1, Math.round(raw)) : Math.round(raw);
      await db.militaryTestResult.create({ data: { testId: test.id, userId, value, recordedAt: keyToDbDate(addDays(today, -7 * (7 - week) - 1)) } });
    }
  }

  await db.calendarEvent.create({
    data: { userId, type: "SIMULATION", title: "Simulado completo EFOMM", description: "Prova inteira com tempo oficial informado no edital.", allDay: false, startsAt: zonedToUtc(addDays(today, 5), 8 * 60, TZ), endsAt: zonedToUtc(addDays(today, 5), 12 * 60, TZ), competitionId: enrollment?.competitionId ?? null },
  });

  if (enrollment) {
    const [registration, written] = enrollment.stages;
    if (registration) await db.studentStage.update({ where: { id: registration.id }, data: { status: "PASSED", date: keyToDbDate(addDays(today, -20)) } });
    if (written) await db.studentStage.update({ where: { id: written.id }, data: { status: "PENDING", date: keyToDbDate(addDays(today, 126)) } });
  }
}

if (process.argv[1]?.endsWith("demo-extras.ts")) {
  (async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Não disponível em produção.");
    const user = await db.user.findUniqueOrThrow({ where: { email: "demo@vertice.app" } });
    await seedDemoExtras(user.id);
    console.log("Extras da conta de demonstração criados.");
  })()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
