import { test } from "node:test";
import assert from "node:assert/strict";
import { windowsForDay, subtractIntervals } from "./routine/availability";
import { analyzeRoutine } from "./routine/analyzer";
import { rankTopics, scoreTopic, type TopicCandidate } from "./study/priority";
import { allocateDailyBudgets, buildSchedule, type ScheduleDay } from "./schedule/scheduler";
import { reviewCard, nextTopicReviewDays, type CardSchedule } from "./review/spaced-repetition";
import { computeReadiness, computeStreak } from "./performance/readiness";
import { learnEnergy } from "./adaptation/energy-learning";
import { checkGoalRealism } from "./adaptation/goal-realism";
import { formatMeasure, parseMeasure, summarizeTaf } from "./military/taf";
import { goalStatus, periodRange, previousPeriod } from "./goals/goals";
import { evaluateAchievements, levelFor, longestStreak } from "./progress/achievements";
import { decide, windowStart } from "./security/sliding-window";
import { checkDraft, extractionBatches } from "./questions/draft-check";
import { keyForQuestion, keyLetter, reconcileWithKey, resolvePaperKey, sameSubject } from "./questions/answer-key";
import { figureMarkers, numbersMissingFromSource, padBox, parseRich, richToPlain } from "./questions/rich-text";
import { refineBox } from "./questions/figure-box";
import type { RoutineBlockInput } from "./types";
import { addDays, zonedToUtc, toDateKey, startOfWeek } from "@/lib/time";

const weekdayRoutine: RoutineBlockInput[] = [1, 2, 3, 4, 5].flatMap((d) => [
  { dayOfWeek: d, startMinute: 0, endMinute: 420, category: "SLEEP", isFixed: true, energy: null },
  { dayOfWeek: d, startMinute: 450, endMinute: 720, category: "COLLEGE", isFixed: true, energy: null },
  { dayOfWeek: d, startMinute: 840, endMinute: 1080, category: "WORK", isFixed: true, energy: null },
  { dayOfWeek: d, startMinute: 1110, endMinute: 1170, category: "TRAINING", isFixed: true, energy: null },
  { dayOfWeek: d, startMinute: 1380, endMinute: 1440, category: "SLEEP", isFixed: true, energy: null },
]);

/* ── time ─────────────────────────────────────────────────────────── */

test("zonedToUtc converts São Paulo wall time to UTC (-03:00)", () => {
  const d = zonedToUtc("2026-09-14", 8 * 60, "America/Sao_Paulo");
  assert.equal(d.toISOString(), "2026-09-14T11:00:00.000Z");
  assert.equal(toDateKey(new Date("2026-09-14T02:30:00Z"), "America/Sao_Paulo"), "2026-09-13");
  assert.equal(startOfWeek("2026-09-13"), "2026-09-07"); // Sunday → previous Monday
});

/* ── availability ─────────────────────────────────────────────────── */

test("fixed commitments are never available and fatigue lowers the evening class", () => {
  const ws = windowsForDay(1, weekdayRoutine);
  for (const w of ws) {
    for (const b of weekdayRoutine.filter((b) => b.dayOfWeek === 1)) {
      assert.ok(w.end <= b.startMinute || w.start >= b.endMinute, `window ${w.start}-${w.end} overlaps ${b.category}`);
    }
  }
  const evening = ws.find((w) => w.start >= 1170);
  assert.ok(evening, "evening window exists");
  // 4h15 college + 4h work = 8h15 mandatory before → penalty
  assert.notEqual(evening!.slotClass, "A");
  const weekend = windowsForDay(6, weekdayRoutine);
  assert.ok(weekend.some((w) => w.slotClass === "A"), "free Saturday morning is high performance");
});

test("subtractIntervals removes occupied time with padding", () => {
  const ws = windowsForDay(6, []);
  const out = subtractIntervals(ws, [{ start: 600, end: 660 }], 10);
  assert.ok(out.every((w) => w.end <= 590 || w.start >= 670));
});

/* ── analyzer ─────────────────────────────────────────────────────── */

test("detects 4h of study after 9h of obligations with a concrete suggestion", () => {
  const blocks: RoutineBlockInput[] = [
    { dayOfWeek: 2, startMinute: 480, endMinute: 720, category: "WORK", isFixed: true, energy: null },
    { dayOfWeek: 2, startMinute: 780, endMinute: 1080, category: "WORK", isFixed: true, energy: null },
    { dayOfWeek: 2, startMinute: 1140, endMinute: 1380, category: "STUDY", isFixed: false, energy: null },
  ];
  const a = analyzeRoutine({ blocks, weeklyTargetMinutes: 1200, dailyLimitMinutes: 360, maxSessionMinutes: 90 });
  const d = a.diagnostics.find((x) => x.code === "STUDY_AFTER_OBLIGATIONS");
  assert.ok(d, "diagnostic present");
  assert.match(d!.detail, /4h de estudo após 9h/);
  assert.match(d!.suggestion ?? "", /Reduza esse bloco para 2h30/);
});

test("recommends reducing an unrealistic goal from execution history", () => {
  const a = analyzeRoutine({
    blocks: [],
    weeklyTargetMinutes: 25 * 60,
    dailyLimitMinutes: 480,
    maxSessionMinutes: 90,
    history: [
      { weekStart: "2026-09-07", plannedMinutes: 1500, executedMinutes: 900 },
      { weekStart: "2026-08-31", plannedMinutes: 1500, executedMinutes: 900 },
      { weekStart: "2026-08-24", plannedMinutes: 1500, executedMinutes: 900 },
    ],
  });
  const d = a.diagnostics.find((x) => x.code === "UNREALISTIC_TARGET");
  assert.ok(d);
  assert.match(d!.detail, /15h/);
  assert.match(d!.suggestion ?? "", /17h/);
  assert.equal(a.recommendedMinutes, 17 * 60 + 30); // 15h × 1.15, rounded to 30 min
});

/* ── study engine ─────────────────────────────────────────────────── */

function topic(partial: Partial<TopicCandidate> & { topicId: string; subjectId: string }): TopicCandidate {
  return {
    topicName: partial.topicId,
    subjectName: partial.subjectId,
    subjectArea: "Exatas",
    parentName: null,
    competitions: [{ competitionId: "efomm", competitionName: "EFOMM", isPrimary: true, weightShare: null, incidence: null, daysToExam: 126 }],
    progress: null,
    hardSubject: false,
    recentErrors: 0,
    ...partial,
  };
}

const measured = (acc: number, n = 40) => ({
  status: "STUDIED" as const,
  questionsAnswered: n,
  questionsCorrect: Math.round(acc * n),
  studiedMinutes: 300,
  daysSinceStudied: 5,
  daysToReview: 3,
});

test("weaker subject gets higher priority, explained with real numbers", () => {
  const ranked = rankTopics([
    topic({ topicId: "Gramática", subjectId: "Português", progress: measured(0.86) }),
    topic({ topicId: "Funções", subjectId: "Matemática", progress: measured(0.72) }),
    topic({ topicId: "Dinâmica", subjectId: "Física", progress: measured(0.48) }),
    topic({ topicId: "Reading", subjectId: "Inglês", progress: measured(0.82) }),
  ]);
  assert.equal(ranked[0]!.topicId, "Dinâmica");
  assert.ok(ranked.at(-1)!.score > 0, "strong subjects are not abandoned");
  assert.match(ranked[0]!.summary, /abaixo da meta de 70%/);
  assert.ok(ranked[0]!.reasons.some((r) => r.code === "WEIGHT_UNCONFIRMED"), "unconfirmed weight is disclosed");
});

test("overdue review raises priority and is explained", () => {
  const base = topic({ topicId: "Trigonometria", subjectId: "Matemática", progress: { ...measured(0.75), daysToReview: -17 } });
  const s = scoreTopic(base);
  assert.ok(s.factors.reviewNeed > 1);
  assert.ok(s.reasons.some((r) => /atrasada há 17 dias/.test(r.text)));
});

/* ── schedule engine ──────────────────────────────────────────────── */

test("daily budgets respect caps and sum to the budget", () => {
  const alloc = allocateDailyBudgets([60, 600, 0, 120], 300);
  assert.equal(alloc[2], 0);
  assert.ok(alloc[0]! <= 60);
  assert.ok(Math.abs(alloc.reduce((a, b) => a + b, 0) - 300) <= 4);
});

test("schedule never overlaps, respects daily limit and balances subjects", () => {
  const weekStart = "2026-09-14";
  const days: ScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    key: addDays(weekStart, d - 1),
    isoWeekday: d,
    windows: windowsForDay(d, weekdayRoutine),
    existingMinutes: 0,
    hasFlashcards: false,
  }));
  const topics = rankTopics([
    topic({ topicId: "Dinâmica", subjectId: "Física", progress: null }),
    topic({ topicId: "Cinemática", subjectId: "Física", progress: null }),
    topic({ topicId: "Funções", subjectId: "Matemática", progress: null }),
    topic({ topicId: "Crase", subjectId: "Português", subjectArea: "Linguagens", progress: measured(0.8) }),
    topic({ topicId: "Reading", subjectId: "Inglês", subjectArea: "Linguagens", progress: measured(0.6) }),
  ]);
  const result = buildSchedule({
    days,
    budgetMinutes: 17.5 * 60,
    dailyLimitMinutes: 240,
    maxSessionMinutes: 60,
    minBreakMinutes: 10,
    topics,
    flashcards: { total: 30, dueNow: 12 },
    unresolvedErrors: 0,
  });

  assert.ok(result.items.length > 10);
  const byDay = new Map<string, typeof result.items>();
  for (const i of result.items) byDay.set(i.dateKey, [...(byDay.get(i.dateKey) ?? []), i]);
  for (const [, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k]!.startMinute >= sorted[k - 1]!.endMinute, "no overlap");
    assert.ok(list.reduce((a, i) => a + i.endMinute - i.startMinute, 0) <= 240, "daily limit");
    assert.ok(list.every((i) => i.endMinute - i.startMinute <= 60), "max session");
  }
  // Every item is explainable.
  assert.ok(result.items.every((i) => i.reason.length > 10));
  // No subject above 40% of planned minutes.
  const perSubject = new Map<string, number>();
  for (const i of result.items) if (i.subjectId) perSubject.set(i.subjectId, (perSubject.get(i.subjectId) ?? 0) + i.endMinute - i.startMinute);
  for (const [, m] of perSubject) assert.ok(m <= 17.5 * 60 * 0.4 + 60);
  assert.equal(perSubject.size, 4, "all subjects appear");
  // Theory is followed by questions on the same topic.
  assert.ok(result.items.some((i) => i.reasonData.reasons.some((r) => r.code === "FOLLOW_UP")));
  // Flashcards are scheduled.
  assert.ok(result.items.some((i) => i.kind === "FLASHCARDS"));
});

/* ── review engine ────────────────────────────────────────────────── */

test("spaced repetition graduates, grows intervals and handles lapses", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  let card: CardSchedule = { state: "NEW", intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, learningStep: 0, dueAt: now, lastReviewedAt: null };
  card = reviewCard(card, "GOOD", now).next; // step 1 (1 day)
  assert.equal(card.state, "LEARNING");
  card = reviewCard(card, "GOOD", now).next; // graduate
  assert.equal(card.state, "REVIEW");
  assert.equal(card.intervalDays, 1);
  const later = new Date(now.getTime() + 86_400_000);
  const good = reviewCard(card, "GOOD", later);
  assert.equal(good.next.intervalDays, 2.5);
  const lapse = reviewCard(good.next, "AGAIN", later).next;
  assert.equal(lapse.state, "RELEARNING");
  assert.equal(lapse.lapses, 1);
  assert.ok(lapse.ease < good.next.ease);
  assert.equal(nextTopicReviewDays(1, 0.5), 1);
  assert.equal(nextTopicReviewDays(2, 0.9), 15);
});

/* ── readiness ────────────────────────────────────────────────────── */

test("readiness refuses to invent a number without evidence", () => {
  const r = computeReadiness({
    competitionName: "EFOMM",
    coverage: 0.2,
    topicsTotal: 100,
    topicsNotStudied: 80,
    answered: 3,
    correct: 2,
    simulationScores: [],
    reviewHealth: null,
    consistency: null,
    accuracyTrend: null,
    subjects: [],
    criticalTopics: [],
  });
  assert.equal(r.value, null);
  assert.ok(r.insufficientReason);
});

test("readiness explains strengths and gaps", () => {
  const r = computeReadiness({
    competitionName: "EFOMM",
    coverage: 0.82,
    topicsTotal: 100,
    topicsNotStudied: 18,
    answered: 400,
    correct: 300,
    simulationScores: [0.7],
    reviewHealth: 0.8,
    consistency: 0.86,
    accuracyTrend: 0.03,
    subjects: [
      { name: "Português", accuracy: 0.86, answered: 120 },
      { name: "Física", accuracy: 0.56, answered: 90 },
    ],
    criticalTopics: [],
  });
  assert.ok(r.value !== null && r.value > 50 && r.value < 100);
  assert.ok(r.strengths.some((s) => s.includes("Português")));
  assert.ok(r.gaps.some((g) => g.includes("Física")));
  assert.ok(r.gaps.some((g) => g.includes("18%")));
});

test("streak counts consecutive days and survives until the day ends", () => {
  const days = new Set(["2026-09-11", "2026-09-12"]);
  assert.equal(computeStreak(days, "2026-09-13", addDays), 2);
  assert.equal(computeStreak(new Set(["2026-09-10"]), "2026-09-13", addDays), 0);
});

test("a small remaining budget still schedules sessions (subject cap never blocks a single session)", () => {
  const topics = rankTopics([
    topic({ topicId: "Dinâmica", subjectId: "Física" }),
    topic({ topicId: "Funções", subjectId: "Matemática" }),
    topic({ topicId: "Crase", subjectId: "Português", subjectArea: "Linguagens" }),
  ]);
  const result = buildSchedule({
    days: [{ key: "2026-09-13", isoWeekday: 7, windows: windowsForDay(7, []).filter((w) => w.start >= 1080), existingMinutes: 0, hasFlashcards: false }],
    budgetMinutes: 89,
    dailyLimitMinutes: 360,
    maxSessionMinutes: 90,
    minBreakMinutes: 10,
    topics,
    flashcards: { total: 0, dueNow: 0 },
    unresolvedErrors: 0,
  });
  assert.ok(result.items.length >= 1, "at least one session placed");
  assert.ok(result.plannedMinutes <= 89);
});

/* ── adaptation ───────────────────────────────────────────────────── */

test("energy learning rewards a period that performs above the student's own average", () => {
  const learned = learnEnergy([
    { period: "DAWN", answered: 0, correct: 0, ratedSessions: 0, focusSum: 0 },
    { period: "MORNING", answered: 120, correct: 90, ratedSessions: 20, focusSum: 86 },
    { period: "AFTERNOON", answered: 80, correct: 48, ratedSessions: 10, focusSum: 36 },
    { period: "EVENING", answered: 100, correct: 55, ratedSessions: 14, focusSum: 42 },
  ]);
  const morning = learned.find((l) => l.period === "MORNING")!;
  const evening = learned.find((l) => l.period === "EVENING")!;
  assert.ok(morning.delta > 0 && morning.delta <= 1, `morning ${morning.delta}`);
  assert.ok(evening.delta < 0, `evening ${evening.delta}`);
  assert.equal(morning.delta * 4, Math.round(morning.delta * 4), "quarter steps");
  assert.match(morning.reason ?? "", /75% de acertos em 120 questões/);
  assert.equal(learned.find((l) => l.period === "DAWN")!.delta, 0, "no data, no adjustment");
});

test("energy learning stays neutral without enough evidence", () => {
  const learned = learnEnergy([
    { period: "MORNING", answered: 30, correct: 29, ratedSessions: 3, focusSum: 15 },
    { period: "EVENING", answered: 60, correct: 20, ratedSessions: 4, focusSum: 6 },
  ]);
  assert.ok(learned.every((l) => l.delta === 0 && l.reason === null));
});

test("goal realism suggests ~17h30 after three weeks around 15h against a 25h goal (§34)", () => {
  const weeks = [
    { weekStart: "2026-09-07", plannedMinutes: 1500, executedMinutes: 16 * 60 },
    { weekStart: "2026-08-31", plannedMinutes: 1500, executedMinutes: 15 * 60 },
    { weekStart: "2026-08-24", plannedMinutes: 1500, executedMinutes: 14 * 60 },
  ];
  const s = checkGoalRealism(25 * 60, weeks);
  assert.ok(s);
  assert.equal(s!.suggestedMinutes, 17 * 60 + 30);
  assert.match(s!.reason, /execução média foi de 15h/);
  assert.equal(checkGoalRealism(25 * 60, weeks.slice(1)), null, "needs three planned weeks");
  assert.equal(checkGoalRealism(25 * 60, weeks.map((w, i) => (i === 0 ? { ...w, plannedMinutes: 0 } : w))), null, "weeks without a plan do not count");
  assert.equal(checkGoalRealism(null, weeks), null, "no goal, nothing to adjust");
  assert.equal(checkGoalRealism(20 * 60, weeks), null, "average at 75% of the goal is not unrealistic");
});

/* ── military / TAF ───────────────────────────────────────────────── */

test("TAF summary: lower-is-better run tracks best, improvement and progress to target", () => {
  const s = summarizeTaf(
    [
      { dateKey: "2026-08-01", value: 13 * 60 + 20 },
      { dateKey: "2026-09-01", value: 12 * 60 + 40 },
      { dateKey: "2026-08-15", value: 12 * 60 + 30 },
    ],
    "LOWER",
    12 * 60,
  );
  assert.equal(s.latest?.value, 760);
  assert.equal(s.best?.value, 750);
  assert.equal(s.improvement, 40, "13:20 → 12:40 is 40 s better");
  assert.equal(s.gapToTarget, 40);
  assert.equal(s.targetMet, false);
  assert.equal(Math.round((s.progressToTarget ?? 0) * 100), 50);
});

test("TAF summary: higher-is-better reps and target met", () => {
  const s = summarizeTaf([{ dateKey: "2026-08-01", value: 6 }, { dateKey: "2026-09-01", value: 11 }], "HIGHER", 10);
  assert.equal(s.improvement, 5);
  assert.equal(s.targetMet, true);
  assert.equal(s.gapToTarget, 0);
  assert.equal(s.progressToTarget, 1);
  assert.equal(summarizeTaf([], "HIGHER", 10).latest, null);
});

test("TAF measures parse and format without ambiguity", () => {
  assert.equal(parseMeasure("13:20", "SECONDS"), 800);
  assert.equal(parseMeasure("1:02:05", "SECONDS"), 3725);
  assert.equal(parseMeasure("12:75", "SECONDS"), null);
  assert.equal(parseMeasure("8,5", "REPS"), null);
  assert.equal(parseMeasure("12", "REPS"), 12);
  assert.equal(parseMeasure("2400", "METERS"), 2400);
  assert.equal(formatMeasure(800, "SECONDS"), "13:20");
  assert.equal(formatMeasure(3725, "SECONDS"), "1:02:05");
  assert.equal(formatMeasure(2400, "METERS"), "2400 m");
});

/* ── goals ────────────────────────────────────────────────────────── */

test("goal periods: week starts Monday, month handles December", () => {
  assert.deepEqual(periodRange("WEEKLY", "2026-09-17"), { start: "2026-09-14", end: "2026-09-21" });
  assert.deepEqual(periodRange("MONTHLY", "2026-12-31"), { start: "2026-12-01", end: "2027-01-01" });
  assert.deepEqual(periodRange("DAILY", "2026-09-17"), { start: "2026-09-17", end: "2026-09-18" });
  assert.deepEqual(previousPeriod("WEEKLY", periodRange("WEEKLY", "2026-09-17")), { start: "2026-09-07", end: "2026-09-14" });
});

test("goal pace compares progress with the elapsed share of the period", () => {
  const week = periodRange("WEEKLY", "2026-09-17"); // Thursday: 4 of 7 days elapsed
  assert.equal(goalStatus(120, 200, week, "2026-09-17").pace, "ON_TRACK");
  assert.equal(goalStatus(40, 200, week, "2026-09-17").pace, "BEHIND");
  assert.equal(goalStatus(0, 200, week, "2026-09-17").pace, "NOT_STARTED");
  const done = goalStatus(210, 200, week, "2026-09-17");
  assert.equal(done.pace, "DONE");
  assert.equal(done.remaining, 0);
  assert.equal(goalStatus(120, 200, week, "2026-09-17").daysLeft, 3);
});

/* ── progression ──────────────────────────────────────────────────── */

test("levels follow real study hours", () => {
  assert.equal(levelFor(0).level, 1);
  const l = levelFor(40 * 60);
  assert.equal(l.level, 4);
  assert.equal(l.nextHours, 50);
  assert.equal(Math.round(l.progress * 100), 50);
  assert.equal(levelFor(2000 * 60).nextHours, null);
});

test("longest streak and achievements are derived from activity only", () => {
  assert.equal(longestStreak(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"]), 3);
  assert.equal(longestStreak([]), 0);
  const states = evaluateAchievements({ studyMinutes: 700, questions: 120, activeDays: 12, bestStreak: 8, simulations: 0, flashcardReviews: 0, topicsStudied: 3, goalsMet: 0, tafResults: 0 });
  const unlocked = states.filter((s) => s.unlocked).map((s) => s.key);
  assert.deepEqual(unlocked.sort(), ["hours-600", "questions-100", "streak-7"]);
  assert.equal(new Set(states.map((s) => s.key)).size, states.length, "keys are unique");
});

/* ── rate limiting ────────────────────────────────────────────────── */

test("sliding window allows up to the limit and weights the previous window", () => {
  const W = 15 * 60_000;
  const start = windowStart(Date.UTC(2026, 8, 14, 12, 0, 0), W);
  assert.equal(decide(start + 1000, W, 5, { current: 4, previous: 0 }).allowed, true);
  const blocked = decide(start + 1000, W, 5, { current: 5, previous: 0 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > W / 1000 - 5 && blocked.retryAfterSec < (2 * W) / 1000, `retry ${blocked.retryAfterSec}`);
  // Halfway through the window, 8 previous hits still weigh as 4: one more is allowed, two are not.
  assert.equal(decide(start + W / 2, W, 5, { current: 0, previous: 8 }).allowed, true);
  assert.equal(decide(start + W / 2, W, 5, { current: 1, previous: 8 }).allowed, false);
  // Near the end of the window the previous window barely counts.
  assert.equal(decide(start + W - 1000, W, 5, { current: 4, previous: 30 }).allowed, true);
});

test("blocked requests get a retry time that actually unblocks them", () => {
  const W = 60 * 60_000;
  const now = windowStart(Date.UTC(2026, 8, 14, 10, 0, 0), W) + 20 * 60_000;
  for (const counts of [{ current: 3, previous: 0 }, { current: 1, previous: 6 }, { current: 0, previous: 9 }]) {
    const d = decide(now, W, 3, counts);
    assert.equal(d.allowed, false);
    const later = now + d.retryAfterSec * 1000;
    const rolled = windowStart(later, W) !== windowStart(now, W);
    const next = rolled ? { current: 0, previous: counts.current } : counts;
    assert.equal(decide(later, W, 3, next).allowed, true, `counts ${JSON.stringify(counts)} retry ${d.retryAfterSec}`);
  }
});

/* ── past exams ───────────────────────────────────────────────────── */

const OPTIONS = ["2 m/s", "4 m/s", "6 m/s", "8 m/s", "10 m/s"].map((text, i) => ({ label: `(${"ABCDE"[i]})`, text }));
const STATEMENT = "Um bloco desliza sem atrito por um plano inclinado de altura h.";

test("extracted question takes the official key and flags annulled or missing numbers", () => {
  const key = [
    { number: 12, label: "c", annulled: false },
    { number: 13, label: null, annulled: true },
  ];
  const ok = checkDraft({ number: 12, statement: STATEMENT, options: OPTIONS, figures: [] }, key);
  assert.equal(ok.correctLabel, "C");
  assert.deepEqual(ok.options.map((o) => o.label), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(ok.issues, []);

  const annulled = checkDraft({ number: 13, statement: STATEMENT, options: OPTIONS, figures: [] }, key);
  assert.equal(annulled.annulled, true);
  assert.equal(annulled.correctLabel, null);

  const missing = checkDraft({ number: 14, statement: STATEMENT, options: OPTIONS, figures: [] }, key);
  assert.match(missing.issues.join(" "), /não encontrado no gabarito/);
  assert.match(missing.issues.join(" "), /informe a alternativa correta/);
});

test("draft check: figures, markers, garbled text, duplicated letters, reviewer save", () => {
  const withFigure = { number: 3, statement: "Observe a [[FIGURA 1]] e a [[FIGURA 2]]: a velocidade média vale", options: OPTIONS, figures: [{ file: "a.png" }, { file: null }], unmatchedNumbers: ["1176"] };
  const auto = checkDraft(withFigure, [{ number: 3, label: "B", annulled: false }]).issues.join(" | ");
  assert.match(auto, /Figura 2 sem imagem/);
  assert.match(auto, /1176/);
  const saved = checkDraft({ ...withFigure, figures: [{ file: "a.png" }, { file: "b.png" }] }, [{ number: 3, label: "B", annulled: false }], { reviewed: true });
  assert.deepEqual(saved.issues, []);
  assert.match(checkDraft({ ...withFigure, figures: [{ file: "a.png" }, { file: "b.png" }] }, null, { reviewed: false }).issues.join(), /Confira o recorte/);
  assert.match(checkDraft({ ...withFigure, figures: [{ file: "a.png" }] }, null).issues.join(), /cita a figura 2/);

  const bad = checkDraft({ number: 4, statement: `Observe o gráfico abaixo e responda: m${String.fromCharCode(0xfffd)}dia`, options: [{ label: "A", text: "1" }, { label: "A", text: "2" }], figures: [], proposedLabel: "E" }, null);
  const text = bad.issues.join(" | ");
  assert.match(text, /cita figura/);
  assert.match(text, /corrompidos/);
  assert.match(text, /repetidas/);
  assert.match(text, /não corresponde/);
  assert.equal(bad.correctLabel, null);
  assert.deepEqual(extractionBatches(40, 15), [{ from: 1, to: 15 }, { from: 16, to: 30 }, { from: 31, to: 40 }]);
  assert.deepEqual(extractionBatches(40, 20, 21), [{ from: 21, to: 40 }]);
});

test("answer key: version and subject matching, changed answers, restarted numbering", () => {
  const block = (version: string, section: string, from: number, letters: string) => ({ version, section, answers: [...letters].map((l, i) => ({ number: from + i, label: l === "*" ? "" : l, annulled: l === "*" })) });
  const key = [block("BRANCA", "MATEMÁTICA", 1, "BEE*"), block("BRANCA", "FÍSICA", 5, "ACBE"), block("AMARELA", "MATEMÁTICA", 1, "DDCD"), block("BRANCA", "INGLÊS", 1, "BDEB")];
  key[1]!.answers[3]!.label = "Alterada de E para D";
  const day2 = resolvePaperKey("2º dia, prova branca", [{ subject: "Matematica", from: 1, to: 4 }, { subject: "Física", from: 5, to: 8 }], key);
  assert.equal(day2.note, null);
  assert.deepEqual(day2.entries.map((e) => (e.annulled ? "*" : e.label)).join(""), "BEE*ACBD");

  const noLayout = resolvePaperKey("Prova Amarela", [], key);
  assert.deepEqual(noLayout.entries.map((e) => e.label).join(""), "DDCD");
  assert.match(resolvePaperKey("Prova verde", [], key).note ?? "", /Nenhuma versão/);
  // Without a section map, numbers restart per subject (Matemática 1–4 and Inglês 1–4): the question's subject decides.
  const both = resolvePaperKey("branca", [], key).entries;
  const english2 = keyForQuestion(both, 2, ["Inglês", "ingles"]).find((e) => e.number === 2);
  const math2 = keyForQuestion(both, 2, ["matematica"]).find((e) => e.number === 2);
  assert.equal(english2?.label, "D");
  assert.equal(math2?.label, "E");
  assert.equal(keyForQuestion(both, 2, []).find((e) => e.number === 2), undefined, "an unresolved tie is left out, not guessed");

  // Shared words ("versão", "tipo") do not match every version; the distinguishing letter or colour does.
  const afa = ["VERSÃO A", "VERSÃO B", "VERSÃO C"].map((version, i) => block(version, "GABARITO OFICIAL", 1, ["CCAD", "DDAC", "BCBC"][i]!));
  const layout = [{ subject: "Língua Portuguesa", from: 1, to: 2 }, { subject: "Matemática", from: 3, to: 4 }];
  const versionA = resolvePaperKey("Prova P1, versão A", layout, afa);
  assert.equal(versionA.note, null);
  assert.equal(versionA.entries.map((e) => e.label).join(""), "CCAD");
  assert.equal(resolvePaperKey("Prova P1, versão C", [], afa).entries.map((e) => e.label).join(""), "BCBC");
  const esa = ["A", "B"].map((version, i) => block(version, "GERAL", 1, ["AB", "BA"][i]!));
  assert.equal(resolvePaperKey("Área geral, tipo A", [], esa).entries.map((e) => e.label).join(""), "AB");
  assert.equal(resolvePaperKey("2º dia, prova amarela", [], key).entries.map((e) => e.label).join(""), "DDCD");

  // Escola Naval: day headings hold two subjects; "Língua Portuguesa" is in "Física e Português".
  const en = [block("AMARELA", "1º Dia - Prova de Matemática e Inglês", 1, "ABCD"), block("AMARELA", "2º Dia - Prova de Física e Português", 1, "DCBA")];
  const enDay2 = resolvePaperKey("2º dia, prova amarela", [{ subject: "Física", from: 1, to: 2 }, { subject: "Língua Portuguesa", from: 3, to: 4 }], en);
  assert.equal(enDay2.note, null);
  assert.equal(enDay2.entries.map((e) => e.label).join(""), "DCBA");
  assert.equal(sameSubject("1º Dia - Prova de Matemática", "2º Dia - Prova de Física"), false);
  assert.equal(sameSubject("Português, Estudos sociais e Ciências", "portugues"), true);
});

test("answer key corrects the question count only when it has one block for the version", () => {
  const block = (version: string, section: string, count: number) => ({ version, section, answers: Array.from({ length: count }, (_, i) => ({ number: i + 1, label: "A", annulled: false })) });
  // ESA/EAM: one block of 50 — the model said 15 and mapped only Portuguese.
  const single = reconcileWithKey("Área geral, tipo A", [block("A", "GERAL", 50), block("B", "GERAL", 50)], [{ subject: "portugues", from: 1, to: 15 }], 15, 200);
  assert.deepEqual(single, { expected: 50, layout: [] });
  // Colégio Naval: both days in one key (40 and 50) — the count cannot be taken from it.
  const twoDays = reconcileWithKey("1º dia, prova azul", [block("AZUL", "Matemática e Inglês", 40), block("AZUL", "Português, Estudos sociais e Ciências", 50)], [], 40, 200);
  assert.deepEqual(twoDays, { expected: 40, layout: [] });
  // A complete map stays.
  const map = [{ subject: "Matemática", from: 1, to: 20 }, { subject: "Física", from: 21, to: 40 }];
  assert.deepEqual(reconcileWithKey("prova branca", [block("BRANCA", "GERAL", 40)], map, 40, 200), { expected: 40, layout: map });
  assert.equal(keyLetter("(c)"), "C");
  assert.equal(keyLetter("ANULADA"), null);
});

test("rich text: inline and display math, money signs, figure markers, crop boxes", () => {
  const segs = parseRich("Seja $x^2 = 4$ e R$ 150,00 por $$\\frac{a}{b}$$ [[FIGURA 1]] fim");
  assert.deepEqual(segs.map((s) => s.kind), ["text", "math", "text", "math", "text", "figure", "text"]);
  assert.equal((segs[1] as { tex: string }).tex, "x^2 = 4");
  assert.equal((segs[2] as { text: string }).text, " e R$ 150,00 por ");
  assert.equal((segs[3] as { display: boolean }).display, true);
  assert.deepEqual(parseRich("custa $ 5 e $ 6").map((s) => s.kind), ["text"]);
  assert.deepEqual(parseRich("de $5 a $10").map((s) => s.kind), ["text"]);
  assert.deepEqual(figureMarkers("[[FIGURA 1]] e [[FIGURA 2]]"), [1, 2]);
  assert.equal(richToPlain("vale $\\text{m}^2$ [[FIGURA 1]]"), "vale m^2 [figura]");
  assert.deepEqual(padBox([204, 198, 386, 362]), [192, 186, 398, 374]);
  assert.deepEqual(padBox([990, 5, 998, 20]), [978, 0, 1000, 32]);
  assert.equal(padBox([10, 10, 12, 500]), null);
  assert.deepEqual(numbersMissingFromSource("valor 1176 ou 72 e 3240", "(A) O (B) 72 (C) 1176 (D) 3240"), []);
  assert.deepEqual(numbersMissingFromSource("valor 4177", "(E) 4176"), ["4177"]);
});

test("figure box grows over a cut drawing and drops a text line above it", () => {
  const width = 1000;
  const height = 1000;
  const data = new Uint8Array(width * height * 4).fill(255);
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  };
  // Drawing: rectangle outline 300–700 × 400–800 with a diagonal.
  paint(300, 400, 700, 403);
  paint(300, 797, 700, 800);
  paint(300, 400, 303, 800);
  paint(697, 400, 700, 800);
  for (let i = 0; i < 400; i++) paint(300 + i, 400 + i, 301 + i, 401 + i);
  // A line of "letters" right above the drawing, separated by a small gap.
  for (let x = 300; x < 700; x += 12) paint(x, 360, x + 1, 385);
  const refined = refineBox({ width, height, data }, [370, 350, 700, 650]);
  assert.ok(refined[0] >= 390 && refined[0] <= 400, `top ${refined[0]} should skip the text line`);
  assert.ok(refined[2] >= 800 && refined[2] <= 812, `bottom ${refined[2]} should reach the drawing edge`);
  assert.ok(refined[1] >= 288 && refined[1] <= 300 && refined[3] >= 700 && refined[3] <= 712, `sides ${refined[1]}–${refined[3]}`);
  // Nothing to grow on a blank page: the original box comes back.
  assert.deepEqual(refineBox({ width, height, data: new Uint8Array(width * height * 4).fill(255) }, [100, 100, 200, 200]), [100, 100, 200, 200]);
});
