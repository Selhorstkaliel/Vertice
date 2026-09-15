/**
 * Demonstration account (§63).
 *
 * Creates demo@vertice.app with eight weeks of simulated activity, generated
 * through the real services (plan engine, spaced repetition, simulation
 * scoring). The account is flagged `isDemo`, so the interface shows a
 * permanent "dados fictícios" banner. Deterministic: same seed, same data.
 *
 *   npm run db:seed:demo
 */
import bcrypt from "bcryptjs";
import type { ErrorReason, ReviewRating } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, isoWeekdayOfKey, keyToDbDate, localNow, startOfWeek, zonedToUtc, type DateKey } from "@/lib/time";
import { seededRandom } from "@/lib/utils";
import { DEFAULT_ENERGY } from "@/engines/routine/availability";
import { reviewCard } from "@/engines/review/spaced-repetition";
import { generateWeekPlan, markMissedItems } from "@/modules/plan/service";
import { applyStudyToTopic } from "@/modules/syllabus/progress";
import { finalizeAttempt } from "@/modules/simulations/service";
import { readinessFor } from "@/modules/performance/metrics";
import { toSchedule } from "@/modules/flashcards/service";
import { seedDemoExtras } from "./demo-extras";

if (process.env.NODE_ENV === "production") {
  console.error("A conta de demonstração não pode ser criada em produção.");
  process.exit(1);
}

const EMAIL = "demo@vertice.app";
const PASSWORD = "demo-vertice-2026";
const TZ = "America/Sao_Paulo";
const WEEKS = 8;
const rand = seededRandom(20260914);
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]!;

/** Starting accuracy per subject and weekly improvement. */
const SKILL: Record<string, { base: number; growth: number }> = {
  portugues: { base: 0.72, growth: 0.012 },
  ingles: { base: 0.7, growth: 0.01 },
  matematica: { base: 0.56, growth: 0.022 },
  fisica: { base: 0.44, growth: 0.03 },
};

const REASONS: [ErrorReason, number][] = [
  ["DID_NOT_KNOW", 0.3],
  ["INTERPRETATION", 0.2],
  ["CONFUSED_CONCEPTS", 0.15],
  ["INATTENTION", 0.15],
  ["CALCULATION", 0.12],
  ["FORGOT_FORMULA", 0.05],
  ["GUESS", 0.03],
];

function weighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[0]![0];
}

const CARDS: { subject: string; type: "FORMULA" | "CONCEPT" | "RULE" | "DEFINITION"; front: string; back: string }[] = [
  { subject: "matematica", type: "FORMULA", front: "Termo geral da progressão aritmética", back: "aₙ = a₁ + (n − 1)·r" },
  { subject: "matematica", type: "FORMULA", front: "Soma dos n primeiros termos de uma PG (q ≠ 1)", back: "Sₙ = a₁(qⁿ − 1)/(q − 1)" },
  { subject: "matematica", type: "FORMULA", front: "Coordenadas do vértice da parábola y = ax² + bx + c", back: "xv = −b/2a e yv = −Δ/4a" },
  { subject: "matematica", type: "RULE", front: "log_a(b·c) é igual a", back: "log_a b + log_a c (com a > 0, a ≠ 1, b > 0, c > 0)" },
  { subject: "matematica", type: "FORMULA", front: "Número de combinações de n elementos tomados p a p", back: "C(n, p) = n! / (p!·(n − p)!)" },
  { subject: "fisica", type: "FORMULA", front: "Segunda lei de Newton", back: "F_resultante = m·a" },
  { subject: "fisica", type: "FORMULA", front: "Energia cinética", back: "Ec = m·v²/2" },
  { subject: "fisica", type: "FORMULA", front: "Equação de Torricelli", back: "v² = v₀² + 2·a·Δs" },
  { subject: "fisica", type: "FORMULA", front: "Primeira lei de Ohm", back: "U = R·i" },
  { subject: "fisica", type: "FORMULA", front: "Empuxo (princípio de Arquimedes)", back: "E = d_líquido · V_submerso · g" },
  { subject: "fisica", type: "RULE", front: "Resistores em série: resistência equivalente", back: "R_eq = R₁ + R₂ + … (a corrente é a mesma em todos)" },
  { subject: "fisica", type: "DEFINITION", front: "Relação entre período e frequência", back: "T = 1/f" },
  { subject: "portugues", type: "RULE", front: "Ocorre crase antes de palavra masculina?", back: "Em regra, não. Exceção: expressão “à moda de” subentendida (bife à milanesa)." },
  { subject: "portugues", type: "DEFINITION", front: "Ratificar × retificar", back: "Ratificar = confirmar. Retificar = corrigir." },
  { subject: "portugues", type: "RULE", front: "Onde × aonde", back: "Onde indica lugar em que se está. Aonde, lugar a que se vai (verbos de movimento)." },
  { subject: "portugues", type: "RULE", front: "Por que × porque", back: "Por que: pergunta ou “pelo qual”. Porque: explicação ou causa." },
  { subject: "ingles", type: "CONCEPT", front: "Present perfect com since e for", back: "Ação que começou no passado e continua: I have lived here since 2019 / for five years." },
  { subject: "ingles", type: "DEFINITION", front: "False friend: pretend", back: "Fingir. “Pretender” é intend." },
  { subject: "ingles", type: "DEFINITION", front: "False friend: eventually", back: "Por fim, finalmente. Não significa “eventualmente”." },
  { subject: "ingles", type: "RULE", front: "Estrutura do second conditional", back: "If + simple past, would + verbo: If I had time, I would travel." },
];

async function main() {
  const today = localNow(TZ).key;
  const firstWeek = addDays(startOfWeek(today), -7 * WEEKS);

  await db.user.deleteMany({ where: { email: EMAIL } });
  const [efomm, escolaNaval] = await Promise.all([
    db.competition.findUniqueOrThrow({ where: { slug: "efomm" }, include: { stages: { orderBy: { order: "asc" } } } }),
    db.competition.findUniqueOrThrow({ where: { slug: "escola-naval" }, include: { stages: { orderBy: { order: "asc" } } } }),
  ]);
  const subjects = await db.subject.findMany({ where: { ownerId: null, slug: { in: Object.keys(SKILL) } }, select: { id: true, slug: true } });
  const slugOf = new Map(subjects.map((s) => [s.id, s.slug]));
  const fisica = subjects.find((s) => s.slug === "fisica")!;

  const user = await db.user.create({
    data: {
      email: EMAIL,
      name: "Estudante Demonstração",
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      isDemo: true,
      onboardedAt: zonedToUtc(firstWeek, 8 * 60, TZ),
      createdAt: zonedToUtc(firstWeek, 8 * 60, TZ),
      profile: {
        create: {
          track: "MILITARY",
          goal: "Aprovação na EFOMM",
          weeklyHoursTarget: 20,
          studiesCollege: true,
          physicalPrep: true,
          hardSubjects: { connect: [{ id: fisica.id }] },
        },
      },
      energyPeriods: { create: DEFAULT_ENERGY.map((e) => ({ period: e.period, level: e.level })) },
      routines: {
        create: {
          name: "Rotina principal",
          blocks: {
            create: [1, 2, 3, 4, 5, 6, 7].flatMap((d) => {
              const weekday = d <= 5;
              return [
                { dayOfWeek: d, startMinute: 0, endMinute: weekday ? 390 : 480, category: "SLEEP" as const },
                { dayOfWeek: d, startMinute: 1410, endMinute: 1440, category: "SLEEP" as const },
                { dayOfWeek: d, startMinute: 750, endMinute: 810, category: "MEAL" as const },
                { dayOfWeek: d, startMinute: 1170, endMinute: 1200, category: "MEAL" as const },
                ...(weekday
                  ? [
                      { dayOfWeek: d, startMinute: 450, endMinute: 720, category: "COLLEGE" as const, label: "Faculdade" },
                      { dayOfWeek: d, startMinute: 720, endMinute: 750, category: "COMMUTE" as const },
                      { dayOfWeek: d, startMinute: 1080, endMinute: 1140, category: "TRAINING" as const, label: "Academia" },
                    ]
                  : [{ dayOfWeek: d, startMinute: 900, endMinute: 1080, category: "LEISURE" as const, isFixed: false }]),
              ];
            }),
          },
        },
      },
    },
  });

  for (const [c, primary, customExamDate] of [
    [efomm, true, keyToDbDate(addDays(today, 126))],
    [escolaNaval, false, null],
  ] as const) {
    await db.studentCompetition.create({
      data: {
        userId: user.id,
        competitionId: c.id,
        isPrimary: primary,
        customExamDate,
        createdAt: zonedToUtc(firstWeek, 8 * 60, TZ),
        stages: { create: c.stages.map((s, i) => ({ name: s.name, order: s.order, status: i === 0 ? "PASSED" : i === 1 ? "IN_PROGRESS" : "PENDING" })) },
      },
    });
  }

  // Manual flashcards created in the first days.
  for (const [i, card] of CARDS.entries()) {
    const subjectId = subjects.find((s) => s.slug === card.subject)!.id;
    await db.flashcard.create({
      data: {
        userId: user.id,
        subjectId,
        front: card.front,
        back: card.back,
        type: card.type,
        origin: "DEMO",
        tags: ["demo"],
        createdAt: zonedToUtc(addDays(firstWeek, i % 3), 20 * 60, TZ),
        dueAt: zonedToUtc(addDays(firstWeek, i % 3), 20 * 60, TZ),
      },
    });
  }

  const questionsBySubject = new Map<string, { id: string; topicId: string | null; subjectId: string; examBoardId: string | null; options: { id: string; label: string; isCorrect: boolean }[] }[]>();
  for (const q of await db.question.findMany({
    where: { ownerId: null, subjectId: { in: subjects.map((s) => s.id) } },
    select: { id: true, topicId: true, subjectId: true, examBoardId: true, options: { select: { id: true, label: true, isCorrect: true } } },
  })) {
    const list = questionsBySubject.get(q.subjectId) ?? [];
    list.push(q);
    questionsBySubject.set(q.subjectId, list);
  }

  const skillAt = (subjectId: string | null, week: number) => {
    const s = SKILL[slugOf.get(subjectId ?? "") ?? ""] ?? { base: 0.6, growth: 0.01 };
    return Math.min(0.9, s.base + s.growth * week);
  };

  async function answer(questionId: string, week: number, at: Date) {
    const q = [...questionsBySubject.values()].flat().find((x) => x.id === questionId)!;
    const correctOpt = q.options.find((o) => o.isCorrect)!;
    const isCorrect = chance(skillAt(q.subjectId, week));
    const selected = isCorrect ? correctOpt : pick(q.options.filter((o) => !o.isCorrect));
    await db.$transaction(async (tx) => {
      const attempt = await tx.questionAttempt.create({
        data: { userId: user.id, questionId: q.id, selectedOptionId: selected.id, isCorrect, timeSpentSec: Math.round(between(40, 180)), createdAt: at },
      });
      await tx.userQuestionState.upsert({
        where: { userId_questionId: { userId: user.id, questionId: q.id } },
        update: { attempts: { increment: 1 }, lastCorrect: isCorrect, lastAttemptAt: at },
        create: { userId: user.id, questionId: q.id, attempts: 1, lastCorrect: isCorrect, lastAttemptAt: at },
      });
      if (q.topicId) {
        await applyStudyToTopic(tx, { userId: user.id, topicId: q.topicId, minutes: 0, kind: "QUESTIONS", contentCompleted: false, questions: { answered: 1, correct: isCorrect ? 1 : 0 }, at, tz: TZ });
      }
      if (!isCorrect) {
        await tx.errorEntry.create({
          data: {
            userId: user.id,
            questionId: q.id,
            attemptId: attempt.id,
            subjectId: q.subjectId,
            topicId: q.topicId,
            examBoardId: q.examBoardId,
            selectedLabel: selected.label,
            correctLabel: correctOpt.label,
            reason: chance(0.8) ? weighted(REASONS) : null,
            createdAt: at,
          },
        });
      }
    });
  }

  let simulationCount = 0;
  for (let week = 0; week <= WEEKS; week++) {
    const weekStart = addDays(firstWeek, 7 * week);
    if (weekStart > today) break;
    await generateWeekPlan(user.id, { now: zonedToUtc(weekStart, 6 * 60, TZ) });

    for (let d = 0; d < 7; d++) {
      const day: DateKey = addDays(weekStart, d);
      if (day > today) break;
      const weekend = isoWeekdayOfKey(day) >= 6;
      const items = await db.studyPlanItem.findMany({ where: { userId: user.id, date: keyToDbDate(day), status: "PLANNED" }, orderBy: { startMinute: "asc" } });

      for (const item of items) {
        const endAt = zonedToUtc(day, item.endMinute, TZ);
        if (endAt.getTime() > Date.now()) continue;
        if (!chance(weekend ? 0.7 : 0.82)) continue;

        const startedAt = zonedToUtc(day, item.startMinute, TZ);
        const planned = item.endMinute - item.startMinute;
        const minutes = Math.max(10, Math.round(planned * between(0.82, 1)));
        const reported = item.kind === "QUESTIONS" ? Math.round(between(8, 16)) : 0;
        const reportedCorrect = Math.round(reported * Math.min(0.95, skillAt(item.subjectId, week) + between(-0.08, 0.08)));

        await db.$transaction(async (tx) => {
          await tx.studySession.create({
            data: {
              userId: user.id,
              planItemId: item.id,
              subjectId: item.subjectId,
              topicId: item.topicId,
              kind: item.kind,
              status: "COMPLETED",
              plannedMinutes: planned,
              startedAt,
              endedAt: new Date(startedAt.getTime() + minutes * 60_000),
              effectiveSeconds: minutes * 60,
              focus: Math.round(between(3, 5)),
              questionsCount: reported || null,
              questionsCorrect: reported ? reportedCorrect : null,
            },
          });
          await tx.studyPlanItem.update({ where: { id: item.id }, data: { status: "DONE", completedAt: endAt } });
          if (item.topicId) {
            await applyStudyToTopic(tx, {
              userId: user.id,
              topicId: item.topicId,
              minutes,
              kind: item.kind,
              contentCompleted: item.kind === "NEW_CONTENT" && chance(0.75),
              questions: reported ? { answered: reported, correct: reportedCorrect } : undefined,
              at: endAt,
              tz: TZ,
            });
          }
        });

        if (item.kind === "QUESTIONS" && item.subjectId) {
          const pool = questionsBySubject.get(item.subjectId) ?? [];
          const preferred = pool.filter((q) => q.topicId === item.topicId);
          const chosen = [...preferred, ...pool.filter((q) => q.topicId !== item.topicId)].slice(0, 4);
          for (const [i, q] of chosen.entries()) await answer(q.id, week, new Date(startedAt.getTime() + (i + 1) * 4 * 60_000));
        }

        if (item.kind === "FLASHCARDS") {
          const due = await db.flashcard.findMany({ where: { userId: user.id, suspended: false, dueAt: { lte: endAt } }, orderBy: { dueAt: "asc" }, take: 20 });
          let t = startedAt.getTime();
          for (const card of due) {
            t += between(15, 45) * 1000;
            const rating: ReviewRating = weighted([["AGAIN", 0.1], ["HARD", 0.15], ["GOOD", 0.6], ["EASY", 0.15]]);
            const at = new Date(t);
            const { next } = reviewCard(toSchedule(card), rating, at);
            await db.$transaction([
              db.flashcard.update({
                where: { id: card.id },
                data: { state: next.state, intervalDays: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses, learningStep: next.learningStep, dueAt: next.dueAt, lastReviewedAt: at },
              }),
              db.flashcardReview.create({
                data: { flashcardId: card.id, userId: user.id, rating, stateBefore: card.state, intervalBefore: card.intervalDays, intervalAfter: next.intervalDays, easeBefore: card.ease, easeAfter: next.ease, durationMs: Math.round(between(4000, 20000)), reviewedAt: at },
              }),
            ]);
          }
        }

        if (item.kind === "ERROR_NOTEBOOK") {
          const open = await db.errorEntry.findMany({ where: { userId: user.id, resolvedAt: null, createdAt: { lt: endAt } }, take: 5, select: { id: true } });
          await db.errorEntry.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { resolvedAt: endAt } });
        }
      }

      // Every other Saturday: a 10-question simulation for the primary competition.
      if (isoWeekdayOfKey(day) === 6 && week % 2 === 1) {
        const start = zonedToUtc(day, 9 * 60, TZ);
        const pool = subjects.flatMap((s) => (questionsBySubject.get(s.id) ?? []).slice(0, 3));
        if (start.getTime() < Date.now() && pool.length > 0) {
          simulationCount++;
          const chosen = pool.sort(() => rand() - 0.5).slice(0, 10);
          const sim = await db.simulation.create({
            data: {
              userId: user.id,
              title: `Simulado EFOMM ${simulationCount}`,
              competitionId: efomm.id,
              questionCount: chosen.length,
              timeLimitMinutes: 60,
              createdAt: start,
              subjects: { create: subjects.map((s) => ({ subjectId: s.id })) },
              questions: { create: chosen.map((q, order) => ({ questionId: q.id, order })) },
            },
            include: { questions: true },
          });
          const attempt = await db.simulationAttempt.create({ data: { simulationId: sim.id, userId: user.id, startedAt: start, deadlineAt: new Date(start.getTime() + 60 * 60_000) } });
          for (const [i, sq] of sim.questions.entries()) {
            const q = chosen.find((x) => x.id === sq.questionId)!;
            if (chance(0.06)) continue;
            const isCorrect = chance(skillAt(q.subjectId, week));
            const opt = isCorrect ? q.options.find((o) => o.isCorrect)! : pick(q.options.filter((o) => !o.isCorrect));
            await db.simulationAnswer.create({
              data: { attemptId: attempt.id, simulationQuestionId: sq.id, selectedOptionId: opt.id, flagged: chance(0.1), answeredAt: new Date(start.getTime() + (i + 1) * 4 * 60_000) },
            });
          }
          await finalizeAttempt(user.id, attempt.id, TZ, new Date(start.getTime() + 45 * 60_000));
        }
      }

      // Snapshot of the state at the end of the day.
      const { readiness, coverage } = await readinessFor(user.id, { id: efomm.id, name: efomm.name }, TZ, day);
      const date = keyToDbDate(day);
      await db.performanceSnapshot.upsert({
        where: { userId_date_scopeKey: { userId: user.id, date, scopeKey: `competition:${efomm.id}` } },
        update: { readiness: readiness.value, coverage: coverage.coverage },
        create: { userId: user.id, date, scopeKey: `competition:${efomm.id}`, readiness: readiness.value, coverage: coverage.coverage },
      });
    }
    process.stdout.write(`semana ${week + 1}/${WEEKS + 1} `);
  }

  await markMissedItems(user.id, TZ);
  await seedDemoExtras(user.id);
  const counts = await Promise.all([
    db.studySession.count({ where: { userId: user.id } }),
    db.questionAttempt.count({ where: { userId: user.id } }),
    db.flashcardReview.count({ where: { userId: user.id } }),
    db.simulationAttempt.count({ where: { userId: user.id } }),
    db.errorEntry.count({ where: { userId: user.id } }),
    db.performanceSnapshot.count({ where: { userId: user.id } }),
  ]);
  console.log(`\nConta de demonstração pronta: ${EMAIL} / ${PASSWORD}`);
  console.log(`Sessões ${counts[0]}, tentativas ${counts[1]}, revisões de flashcards ${counts[2]}, simulados ${counts[3]}, erros ${counts[4]}, snapshots ${counts[5]}.`);
  console.log("Os dados são fictícios e a interface exibe um aviso permanente nesta conta.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
