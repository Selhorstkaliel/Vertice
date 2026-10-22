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
import { checkDraft, extractionBatches, missingBaseText } from "./questions/draft-check";
import { correctKeyFromText, keyForQuestion, keyLetter, keyPairsFromText, reconcileWithKey, resolvePaperKey, sameSubject } from "./questions/answer-key";
import { figureMarkers, numbersMissingFromSource, padBox, parseRich, richToPlain } from "./questions/rich-text";
import { refineBox } from "./questions/figure-box";
import { computeIncidence, describeIncidence, NEUTRAL_INCIDENCE } from "./study/incidence";
import { buildDailyMission, pickWeakTopic, ERROR_MIN_AGE_DAYS, type MissionInput } from "./study/daily-mission";
import { compareWithCutoff, examModeMinutes, scoreAttempt, slowQuestions, type Outcome } from "./simulations/scoring";
import { planDiagnostic } from "./study/diagnostic";
import { dueReminders, reminderTitle } from "./military/deadlines";
import { planTafProgression } from "./military/taf-progression";
import { essayCadence } from "./essays/cadence";
import { combineRuns, criterionTrends, estimateLines, lineCheck, recurringWeakCriteria, verifiedExcerpt, type CorrectionRun } from "./essays/correction";
import { calibrationStats, pickModel } from "./essays/calibration";
import { decideOfflineReview, remainingQueue } from "./review/offline-sync";
import { documentLinks, extractLinks, isFileLink } from "./editais/links";
import { classifyDocument, READ_TYPES } from "./editais/classify";
import { robotsAllows } from "./editais/robots";
import { checkExtraction, dateInText, numberInText, relevantPages } from "./editais/checks";
import { compareWithCurrent, isDateField } from "./editais/changes";
import { matchSubject, matchTopic, statusFromDates } from "./editais/status";
import { toFields } from "./editais/fields";
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

  // Colégio Naval: um gabarito, os dois dias, numeração repetida. O dia com 50
  // questões é o que termina no 50; sem essa conta os números em comum ficavam sem resposta.
  const cn = [block("AZUL", "Matemática e Inglês", 1, "ABCD"), block("AZUL", "Português, Estudos sociais e Ciências", 1, "DCBA".repeat(2))];
  assert.equal(resolvePaperKey("2º dia, prova azul", [], cn, 8).entries.map((e) => e.label).join(""), "DCBADCBA");
  assert.equal(resolvePaperKey("1º dia, prova azul", [], cn, 4).entries.map((e) => e.label).join(""), "ABCD");
  assert.equal(keyForQuestion(resolvePaperKey("2º dia, prova azul", [], cn).entries, 2, []).some((e) => e.number === 2), false, "sem a contagem o empate continua sem resposta");

  // Cesgranrio: a leitura descreveu só as duas primeiras disciplinas, mas o gabarito
  // tem todas — as questões de fora do mapa não podem ficar sem resposta oficial.
  const cesgranrio = [block("", "LÍNGUA PORTUGUESA", 1, "AB"), block("", "MATEMÁTICA", 3, "CD"), block("", "CONHECIMENTOS BANCÁRIOS", 5, "EA")];
  const parcial = resolvePaperKey("Técnico Bancário", [{ subject: "portugues", from: 1, to: 2 }, { subject: "matematica", from: 3, to: 4 }], cesgranrio);
  assert.equal(parcial.entries.map((e) => e.label).join(""), "ABCDEA");
  assert.equal(parcial.entries.find((e) => e.number === 6)?.label, "A");
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

test("a question that sends the student to a base text it does not carry is flagged", () => {
  assert.equal(missingBaseText("A partir da leitura do texto I, pode-se inferir que:"), true);
  assert.equal(missingBaseText("Em relação a aspectos estruturais do texto CB1A1, julgue o item."), true);
  assert.equal(missingBaseText("Analyze the statements about the fragments in Text 1, then choose the correct option."), true);
  assert.equal(missingBaseText("O humor da tirinha se encontra na expressão:"), true);
  // Com o texto-base transcrito, o enunciado deixa de ser um comando solto.
  assert.equal(missingBaseText(`${"A charge mostra um menino na caixa de areia. ".repeat(20)}\n\nO humor da tirinha se encontra na expressão:`), false);
  assert.equal(missingBaseText("Calcule a área do triângulo de lados 3, 4 e 5 cm."), false);
});

test("the printed answer key corrects the one the AI read", () => {
  // Cebraspe: uma faixa de números e, na sequência, as letras; "0" são células vazias da tabela.
  const cebraspe = "CONCURSO 1 2 3 4 5 6 7 8 9 10 E C E E E C E C C E 11 12 13 14 15 16 17 18 19 20 0 0 E E E C C C E E C X Item Gabarito";
  const pairs = keyPairsFromText(cebraspe)!;
  assert.equal(pairs.size, 20);
  assert.equal(pairs.get(2)!.label, "C");
  assert.equal(pairs.get(20)!.annulled, true);
  // Duas versões lado a lado não dizem qual é qual, e um texto curto não dá base.
  assert.equal(keyPairsFromText(`${cebraspe} 1 2 3 4 5 6 7 8 9 10 C E C C C E C E E C`), null);
  assert.equal(keyPairsFromText("1 2 3 4 5 E C E E E"), null);

  // A IA trocou os itens 5 e 6 de lugar: o texto do PDF desfaz a troca e o resto fica como está.
  const lido = [{ version: "", section: "CARGO", answers: [...pairs].map(([number, a]) => ({ number, ...a })) }];
  lido[0]!.answers[4] = { number: 5, label: "C", annulled: false };
  lido[0]!.answers[5] = { number: 6, label: "E", annulled: false };
  const { sections, corrected } = correctKeyFromText(lido, cebraspe);
  assert.equal(corrected, 2);
  assert.equal(sections[0]!.answers[4]!.label, "E");
  assert.equal(sections[0]!.answers[5]!.label, "C");
  assert.equal(sections[0]!.section, "CARGO", "o bloco lido pela IA é preservado");
  // Com mais de um bloco não dá para saber a qual versão o texto se refere.
  assert.equal(correctKeyFromText([...lido, ...lido], cebraspe).corrected, 0);
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

/* ── incidence ("o que mais cai") ─────────────────────────────────── */

test("incidence: average topic is neutral, frequent topic is high, absent topic is low", () => {
  const topics = [
    { topicId: "a", subjectId: "mat", questions: 20, papers: 4 },
    { topicId: "b", subjectId: "mat", questions: 5, papers: 3 },
    { topicId: "c", subjectId: "mat", questions: 0, papers: 0 },
    { topicId: "d", subjectId: "mat", questions: 5, papers: 2 },
  ];
  const r = computeIncidence({ topics, totalQuestions: 30, subjectPapers: new Map([["mat", 4]]) });
  // 4 topics → expected share 25%; b has 5/30 ≈ 16.7% → ratio 0.67 → 0.4
  assert.ok(r.get("a")!.incidence! > 0.7, "20 of 30 questions is high");
  assert.equal(r.get("c")!.incidence, 0, "never asked with full confidence");
  assert.ok(Math.abs(r.get("b")!.incidence! - 0.4) < 0.01);
  assert.equal(r.get("a")!.confidence, 1);
  // Exactly average share lands on the neutral value.
  const avg = computeIncidence({
    topics: [
      { topicId: "x", subjectId: "s", questions: 3, papers: 3 },
      { topicId: "y", subjectId: "s", questions: 3, papers: 3 },
    ],
    totalQuestions: 6,
    subjectPapers: new Map([["s", 3]]),
  });
  assert.equal(avg.get("x")!.incidence, NEUTRAL_INCIDENCE);
});

test("incidence: few papers pull the value toward the average", () => {
  const topics = [
    { topicId: "once", subjectId: "fis", questions: 3, papers: 1 },
    { topicId: "never", subjectId: "fis", questions: 0, papers: 0 },
    { topicId: "other", subjectId: "fis", questions: 1, papers: 1 },
  ];
  const one = computeIncidence({ topics, totalQuestions: 4, subjectPapers: new Map([["fis", 1]]) });
  const three = computeIncidence({ topics, totalQuestions: 4, subjectPapers: new Map([["fis", 3]]) });
  assert.equal(one.get("once")!.confidence, 0.33);
  assert.ok(one.get("once")!.incidence! < three.get("once")!.incidence!, "one paper is trusted less");
  assert.ok(one.get("never")!.incidence! > 0.3, "one paper is not enough to call a topic irrelevant");
  assert.equal(three.get("never")!.incidence, 0);
  // The papers a topic fell in never exceed the papers that covered its subject.
  assert.ok(one.get("once")!.papers <= one.get("once")!.subjectPapers);
});

test("incidence: no evidence means unknown, never zero", () => {
  const topics = [{ topicId: "t", subjectId: "red", questions: 0, papers: 0 }];
  assert.equal(computeIncidence({ topics, totalQuestions: 50, subjectPapers: new Map() }).get("t")!.incidence, null);
  assert.equal(computeIncidence({ topics, totalQuestions: 0, subjectPapers: new Map([["red", 2]]) }).get("t")!.incidence, null);
  assert.equal(computeIncidence({ topics: [], totalQuestions: 10, subjectPapers: new Map() }).size, 0);
  assert.equal(describeIncidence({ questions: 4, papers: 2, subjectPapers: 3 }), "Caiu em 4 questões, em 2 de 3 provas");
  assert.equal(describeIncidence({ questions: 1, papers: 1, subjectPapers: 1 }), "Caiu em 1 questão, em 1 de 1 prova");
  assert.equal(describeIncidence({ questions: 0, papers: 0, subjectPapers: 2 }), "Não caiu nas 2 provas analisadas");
});

test("incidence feeds priority with the sample in the explanation", () => {
  const base: TopicCandidate = {
    topicId: "t1",
    topicName: "Funções",
    subjectId: "s1",
    subjectName: "Matemática",
    subjectArea: "Exatas",
    parentName: null,
    competitions: [{ competitionId: "c1", competitionName: "EsPCEx", isPrimary: true, weightShare: null, incidence: null, daysToExam: null }],
    progress: null,
    hardSubject: false,
    recentErrors: 0,
  };
  const neutral = scoreTopic(base);
  const avg = scoreTopic({ ...base, competitions: [{ ...base.competitions[0]!, incidence: 0.5 }] });
  assert.equal(avg.score, neutral.score, "average incidence keeps the priority unchanged");
  const high = scoreTopic({
    ...base,
    competitions: [{ ...base.competitions[0]!, incidence: 0.8, incidenceSample: { questions: 12, papers: 4, subjectPapers: 4 } }],
  });
  assert.ok(high.score > neutral.score);
  const reason = high.reasons.find((r) => r.code === "HIGH_INCIDENCE");
  assert.match(reason!.text, /12 questões, em 4 de 4 provas oficiais de EsPCEx/);
  const low = scoreTopic({
    ...base,
    competitions: [{ ...base.competitions[0]!, incidence: 0.1, incidenceSample: { questions: 0, papers: 0, subjectPapers: 4 } }],
  });
  assert.ok(low.score < neutral.score);
  assert.ok(low.reasons.some((r) => r.code === "LOW_INCIDENCE"));
});

/* ── daily mission ────────────────────────────────────────────────── */

const missionBase: MissionInput = {
  targetMinutes: 20,
  dueCardIds: [],
  errors: [],
  topics: [],
  fallbackTopic: { topicId: "f", topicName: "Funções", subjectName: "Matemática", reason: "Maior prioridade." },
  secondsPerCard: 30,
  secondsPerQuestion: 150,
};

test("mission respects the chosen time and mixes cards, errors and a weak topic", () => {
  const plan = buildDailyMission({
    ...missionBase,
    dueCardIds: Array.from({ length: 50 }, (_, i) => `c${i}`),
    errors: Array.from({ length: 10 }, (_, i) => ({ entryId: `e${i}`, questionId: `q${i}`, ageDays: 10 })),
    topics: [
      { topicId: "w", topicName: "Óptica", subjectName: "Física", answered: 12, correct: 4, daysToReview: null },
      { topicId: "ok", topicName: "Cinemática", subjectName: "Física", answered: 12, correct: 11, daysToReview: null },
    ],
  });
  for (const minutes of [15, 20, 30]) {
    const p = buildDailyMission({ ...missionBase, targetMinutes: minutes, dueCardIds: Array.from({ length: 100 }, (_, i) => `c${i}`) });
    assert.ok(p.estSeconds <= minutes * 60, `${minutes} min mission fits`);
  }
  assert.ok(plan.estSeconds <= 20 * 60);
  assert.ok(plan.estSeconds >= 20 * 60 - 150, "fills the time when there is material");
  assert.deepEqual(plan.blocks.map((b) => b.kind), ["FLASHCARDS", "ERRORS", "TOPIC"]);
  const topic = plan.blocks.find((b) => b.kind === "TOPIC");
  assert.equal(topic?.kind === "TOPIC" && topic.topicId, "w", "the weakest measured topic is picked");
  assert.ok(plan.leftOver.cards > 0, "what did not fit is reported");
});

test("mission ignores fresh errors and falls back to the top-priority topic", () => {
  const plan = buildDailyMission({ ...missionBase, errors: [{ entryId: "e", questionId: "q", ageDays: ERROR_MIN_AGE_DAYS - 1 }] });
  assert.equal(plan.blocks.length, 1);
  const b = plan.blocks[0]!;
  assert.equal(b.kind, "TOPIC");
  assert.equal(b.kind === "TOPIC" && b.weak, false);
  assert.equal(b.kind === "TOPIC" && b.questions, 8, "20 min / 2.5 min");
});

test("mission: unused time flows to cards, tiny topic blocks are dropped, nothing at all stays empty", () => {
  const plan = buildDailyMission({ ...missionBase, fallbackTopic: null, dueCardIds: Array.from({ length: 30 }, (_, i) => `c${i}`) });
  assert.equal(plan.blocks.length, 1);
  assert.equal(plan.blocks[0]!.kind === "FLASHCARDS" && plan.blocks[0]!.cardIds.length, 30, "all 30 cards fit in 15 of the 20 minutes");
  const empty = buildDailyMission({ ...missionBase, fallbackTopic: null });
  assert.equal(empty.blocks.length, 0);
  assert.equal(empty.estSeconds, 0);
});

test("weak topic: needs a minimum sample, else uses an overdue review", () => {
  const few = [{ topicId: "a", topicName: "A", subjectName: "S", answered: 3, correct: 0, daysToReview: null }];
  assert.equal(pickWeakTopic(few), null, "3 answers are not evidence");
  const overdue = [...few, { topicId: "b", topicName: "B", subjectName: "S", answered: 20, correct: 19, daysToReview: -4 }];
  const pick = pickWeakTopic(overdue)!;
  assert.equal(pick.topic.topicId, "b");
  assert.match(pick.reason, /atrasada há 4 dias/);
});

/* ── exam scoring ─────────────────────────────────────────────────── */

const outcomes = (subjectId: string, c: number, w: number, b: number) => [
  ...Array.from({ length: c }, () => ({ subjectId, outcome: "CORRECT" as Outcome })),
  ...Array.from({ length: w }, () => ({ subjectId, outcome: "WRONG" as Outcome })),
  ...Array.from({ length: b }, () => ({ subjectId, outcome: "BLANK" as Outcome })),
];

test("scoring: right count with weights, and subjects outside the rule count with weight 1", () => {
  const r = scoreAttempt(
    { mode: "RIGHT_COUNT", wrongPenalty: null, subjects: [{ subjectId: "mat", weight: 2 }], minTotalShare: null },
    [...outcomes("mat", 6, 4, 0), ...outcomes("port", 5, 5, 0)],
  );
  assert.equal(r.points, 6 * 2 + 5);
  assert.equal(r.maxPoints, 10 * 2 + 10);
  assert.equal(r.bySubject.find((s) => s.subjectId === "port")!.inRule, false);
  assert.equal(r.eliminated, false);
});

test("scoring: Cebraspe penalty makes a blank better than a wrong answer", () => {
  const rule = { mode: "PENALTY" as const, wrongPenalty: 1, subjects: [], minTotalShare: null };
  const guessed = scoreAttempt(rule, outcomes("d", 10, 10, 0));
  const blank = scoreAttempt(rule, outcomes("d", 10, 0, 10));
  assert.equal(guessed.points, 0);
  assert.equal(blank.points, 10);
  // Net score can go below zero; it is shown, never hidden.
  assert.equal(scoreAttempt(rule, outcomes("d", 2, 8, 0)).points, -6);
  // Fractional penalty (e.g. 0.25 per wrong answer).
  assert.equal(scoreAttempt({ ...rule, wrongPenalty: 0.25 }, outcomes("d", 8, 4, 0)).points, 7);
});

test("scoring: subject and total minimums eliminate, as shares", () => {
  const r = scoreAttempt(
    { mode: "RIGHT_COUNT", wrongPenalty: null, subjects: [{ subjectId: "a", weight: 1, minShare: 0.5 }, { subjectId: "b", weight: 1 }], minTotalShare: 0.4 },
    [...outcomes("a", 2, 3, 0), ...outcomes("b", 5, 0, 0)],
  );
  assert.equal(r.bySubject.find((s) => s.subjectId === "a")!.belowMinimum, true);
  assert.equal(r.belowTotalMinimum, false);
  assert.equal(r.eliminated, true);
  const empty = scoreAttempt({ mode: "RIGHT_COUNT", wrongPenalty: null, subjects: [], minTotalShare: null }, []);
  assert.equal(empty.share, 0);
  assert.equal(empty.maxPoints, 0);
});

test("cut-off comparison is proportional, and slow questions are split by result", () => {
  const c = compareWithCutoff(0.6, { score: 66, max: 120 })!;
  assert.equal(c.cutoffShare, 0.55);
  assert.equal(c.above, true);
  assert.equal(Math.round(c.equivalentPoints), 72);
  assert.equal(compareWithCutoff(0.5, null), null);
  assert.equal(compareWithCutoff(0.5, { score: 10, max: 0 }), null);

  const items = [
    { id: 1, timeSpentSec: 300, outcome: "WRONG" as Outcome },
    { id: 2, timeSpentSec: 200, outcome: "CORRECT" as Outcome },
    { id: 3, timeSpentSec: 60, outcome: "WRONG" as Outcome },
    { id: 4, timeSpentSec: 0, outcome: "BLANK" as Outcome },
  ];
  const slow = slowQuestions(items, 120);
  assert.deepEqual(slow.wrong.map((i) => i.id), [1]);
  assert.deepEqual(slow.other.map((i) => i.id), [2]);
  // Without history, the simulation's own average (of timed questions) is the base.
  assert.equal(slowQuestions(items, null).averageSec, 187);
  assert.equal(slowQuestions([], null).averageSec, null);

  assert.equal(examModeMinutes(240, 80, 40), 120);
  assert.equal(examModeMinutes(240, null, 40), 240);
  assert.equal(examModeMinutes(240, 80, 80), 240);
});

/* ── diagnostic ───────────────────────────────────────────────────── */

test("diagnostic: 20 questions split by bank incidence, never more than available", () => {
  const plan = planDiagnostic([
    { subjectId: "mat", weight: null, available: 60 },
    { subjectId: "port", weight: null, available: 30 },
    { subjectId: "ing", weight: null, available: 10 },
    { subjectId: "red", weight: null, available: 0 },
  ]);
  assert.equal(plan.status, "FULL");
  assert.equal(plan.basis, "INCIDENCE");
  assert.equal(plan.total, 20);
  assert.deepEqual(plan.quotas, { mat: 12, port: 6, ing: 2 });
  assert.equal(plan.suggestedMinutes, 60);
});

test("diagnostic: confirmed weights decide the split; caps move the rest", () => {
  const plan = planDiagnostic([
    { subjectId: "a", weight: 3, available: 4 },
    { subjectId: "b", weight: 1, available: 40 },
  ]);
  assert.equal(plan.basis, "WEIGHT");
  assert.equal(plan.quotas.a, 4, "capped by what exists");
  assert.equal(plan.quotas.b, 16);
  assert.equal(Object.values(plan.quotas).reduce((x, y) => x + y, 0), 20);
});

test("diagnostic: small banks are reduced or skipped", () => {
  const reduced = planDiagnostic([{ subjectId: "a", weight: null, available: 8 }]);
  assert.equal(reduced.status, "REDUCED");
  assert.equal(reduced.total, 8);
  const none = planDiagnostic([{ subjectId: "a", weight: null, available: 3 }]);
  assert.equal(none.status, "UNAVAILABLE");
  assert.deepEqual(none.quotas, {});
  assert.equal(planDiagnostic([]).status, "UNAVAILABLE");
});

/* ── stage deadlines ──────────────────────────────────────────────── */

test("deadline reminders: one per threshold, no late bursts, date change re-arms", () => {
  const items = [
    { id: "a", title: "Entregar documentos", dueKey: "2026-10-21", done: false },
    { id: "b", title: "Exame de vista", dueKey: "2026-10-16", done: false },
    { id: "c", title: "Recurso", dueKey: "2026-10-15", done: false },
    { id: "d", title: "Feito", dueKey: "2026-10-15", done: true },
    { id: "e", title: "Longe", dueKey: "2026-12-01", done: false },
    { id: "f", title: "Passou", dueKey: "2026-10-10", done: false },
    { id: "g", title: "Sem data", dueKey: null, done: false },
  ];
  const r = dueReminders(items, "2026-10-14");
  assert.deepEqual(
    r.map((x) => [x.itemId, x.offset, x.daysLeft]),
    [
      ["c", 1, 1],
      ["b", 3, 2],
      ["a", 7, 7],
    ],
  );
  assert.equal(reminderTitle(r[0]!), "Amanhã: Recurso");
  assert.equal(reminderTitle(r[1]!), "Faltam 2 dias: Exame de vista");
  const moved = dueReminders([{ ...items[0]!, dueKey: "2026-10-20" }], "2026-10-14");
  assert.notEqual(moved[0]!.dedupeKey, r.find((x) => x.itemId === "a")!.dedupeKey);
  assert.deepEqual(dueReminders([], "2026-10-14"), []);
});

/* ── TAF progression ──────────────────────────────────────────────── */

test("TAF progression: feasible plan is gradual, has relief, re-tests and a taper", () => {
  const p = planTafProgression({ unit: "REPS", betterWhen: "HIGHER", current: 5, target: 8, today: "2026-10-14", testDate: "2027-01-13" });
  assert.equal(p.status, "ON_TRACK");
  assert.equal(p.weeksLeft, 13);
  assert.equal(p.weeks.at(-1)!.kind, "TAPER");
  assert.equal(p.weeks[3]!.kind, "DELOAD");
  assert.ok(p.weeks.some((w) => w.reassess));
  for (let i = 1; i < p.weeks.length; i++) {
    const gain = p.weeks[i]!.goal - p.weeks[i - 1]!.goal;
    assert.ok(gain >= 0 && gain <= 1, `week ${i + 1} gains at most one rep`);
    if (p.weeks[i]!.kind !== "BUILD") assert.equal(gain, 0, "no new goal on relief or taper weeks");
  }
  assert.equal(p.weeks.at(-1)!.goal, 8);
});

test("TAF progression: too little time is said plainly, never compressed", () => {
  const p = planTafProgression({ unit: "SECONDS", betterWhen: "LOWER", current: 900, target: 720, today: "2026-10-14", testDate: "2026-11-11" });
  assert.equal(p.status, "TOO_SHORT");
  assert.ok(p.projected! > 720);
  for (let i = 1; i < p.weeks.length; i++) {
    const before = i === 0 ? 900 : p.weeks[i - 1]!.goal;
    assert.ok(before - p.weeks[i]!.goal <= Math.ceil(before * 0.015), "never faster than the safe step");
  }
  assert.ok(p.buildWeeksNeeded! > 10);
});

test("TAF progression: missing data asks for it instead of guessing", () => {
  const base = { unit: "REPS" as const, betterWhen: "HIGHER" as const, today: "2026-10-14" };
  assert.equal(planTafProgression({ ...base, current: null, target: 8, testDate: "2027-01-01" }).status, "NEED_BASELINE");
  assert.equal(planTafProgression({ ...base, current: 5, target: null, testDate: "2027-01-01" }).status, "NEED_TARGET");
  assert.equal(planTafProgression({ ...base, current: 9, target: 8, testDate: "2027-01-01" }).status, "TARGET_MET");
  const noDate = planTafProgression({ ...base, current: 5, target: 8, testDate: null });
  assert.equal(noDate.status, "NEED_DATE");
  assert.equal(noDate.buildWeeksNeeded, 3);
  assert.equal(planTafProgression({ ...base, current: 5, target: 8, testDate: "2026-10-01" }).status, "TEST_PASSED");
  assert.equal(planTafProgression({ ...base, current: 5, target: 8, testDate: "2026-10-17" }).status, "TOO_SHORT", "days, not weeks, left");
});

/* ── essays ───────────────────────────────────────────────────────── */

test("essay cadence rises as the exam approaches", () => {
  const base = { today: "2026-10-14", weeklyFreeMinutes: 1200, dailyLimitMinutes: 240, doneThisWeek: 0 };
  assert.equal(essayCadence({ ...base, examDate: null }).perWeek, 1);
  assert.equal(essayCadence({ ...base, examDate: "2027-06-01" }).perWeek, 1);
  assert.equal(essayCadence({ ...base, examDate: "2027-02-01" }).perWeek, 2);
  assert.equal(essayCadence({ ...base, examDate: "2026-12-20" }).perWeek, 3);
  const final = essayCadence({ ...base, examDate: "2026-11-01" });
  assert.equal(final.perWeek, 3);
  assert.equal(final.timed, 1);
  assert.equal(final.phase, "FINAL");
  assert.equal(essayCadence({ ...base, examDate: "2026-10-01" }).perWeek, 0);
});

test("essay cadence shrinks to the routine and says why", () => {
  const base = { today: "2026-10-14", examDate: "2026-12-20", dailyLimitMinutes: 240, doneThisWeek: 1 };
  const tight = essayCadence({ ...base, weeklyFreeMinutes: 80 });
  assert.equal(tight.perWeek, 2, "one done plus one that fits");
  assert.equal(tight.remainingThisWeek, 1);
  assert.match(tight.reducedBecause!, /só comporta 2 redações/);
  const noLimit = essayCadence({ ...base, dailyLimitMinutes: 60, weeklyFreeMinutes: 1000 });
  assert.equal(noLimit.perWeek, 0);
  assert.match(noLimit.reducedBecause!, /limite diário/);
  assert.equal(essayCadence({ ...base, weeklyFreeMinutes: null }).perWeek, 3, "no routine: no reduction");
});

test("essay lines are estimated per paragraph and checked against the sheet", () => {
  const text = `${"a".repeat(140)}\n\n${"b".repeat(10)}\n${"c".repeat(71)}`;
  assert.equal(estimateLines(text, 70), 2 + 1 + 2);
  assert.equal(estimateLines("", 70), 0);
  assert.equal(lineCheck(5, 20, 30).ok, false);
  assert.match(lineCheck(25, 20, 30).message, /Cerca de 25 linhas; a folha oficial tem 30/);
  assert.equal(lineCheck(40, null, 30).ok, false);
});

const criteria = [
  { key: "tema", name: "Tema", description: "", maxScore: 4, weight: 1 },
  { key: "lingua", name: "Língua", description: "", maxScore: 6, weight: 1 },
];
const essayText = "A educação transforma vidas.\nPor isso, investir em escolas é urgente.";
const run = (tema: number, lingua: number, extra: Partial<CorrectionRun> = {}): CorrectionRun => ({
  criteria: [
    { key: "tema", score: tema, excerpt: "A educação transforma vidas", comment: "ok" },
    { key: "lingua", score: lingua, excerpt: "trecho inventado que não existe", comment: "ok" },
  ],
  zeroed: false,
  zeroReason: "",
  issues: [{ title: "Coesão", explanation: "x", excerpt: "investir em escolas" }],
  exercise: { paragraph: 2, criterionKey: "lingua", instruction: "Reescreva." },
  ...extra,
});

test("two corrections become a range; invented quotes are dropped; scores are clamped", () => {
  const c = combineRuns(criteria, [run(3, 4), run(4, 4)], essayText, { margin: 0.05, threshold: 0.15, paragraphCount: 2 });
  assert.equal(c.maxScore, 10);
  assert.equal(c.totalMid, 7.5);
  assert.equal(c.totalMin, 6.5);
  assert.equal(c.totalMax, 8.5);
  assert.equal(c.uncertain, false);
  assert.equal(c.scores[0]!.excerpt, "A educação transforma vidas");
  assert.equal(c.scores[1]!.excerpt, null, "a quote that is not in the essay never reaches the student");
  assert.equal(c.exercise!.index, 1);
  const wild = combineRuns(criteria, [run(9, -2), run(9, -2)], essayText, { margin: 0, threshold: 0.15, paragraphCount: 2 });
  assert.equal(wild.scores[0]!.score, 4);
  assert.equal(wild.scores[1]!.score, 0);
});

test("disagreement or a zero from one run makes the correction uncertain", () => {
  const far = combineRuns(criteria, [run(1, 1), run(4, 6)], essayText, { margin: 0.05, threshold: 0.15, paragraphCount: 2 });
  assert.equal(far.uncertain, true);
  assert.equal(far.disagreement, 0.8);
  const oneZero = combineRuns(criteria, [run(3, 4, { zeroed: true, zeroReason: "Fuga ao tema" }), run(3, 4)], essayText, { margin: 0.05, threshold: 0.15, paragraphCount: 2 });
  assert.equal(oneZero.uncertain, true);
  assert.equal(oneZero.totalMin, 0);
  assert.equal(oneZero.zeroFlag, "Fuga ao tema");
  const bothZero = combineRuns(criteria, [run(3, 4, { zeroed: true }), run(3, 4, { zeroed: true })], essayText, { margin: 0.05, threshold: 0.15, paragraphCount: 2 });
  assert.equal(bothZero.totalMax, 0);
  const badExercise = combineRuns(criteria, [run(3, 4, { exercise: { paragraph: 9, criterionKey: "lingua", instruction: "" } }), run(3, 4)], essayText, { margin: 0, threshold: 0.15, paragraphCount: 2 });
  assert.equal(badExercise.exercise, null);
  assert.equal(verifiedExcerpt("  “A educação   transforma vidas”  ".replace(/[“”]/g, ""), essayText) !== null, true);
});

test("criterion trends compare early and recent essays", () => {
  const h = [
    { scores: [{ key: "tema", name: "Tema", score: 2, maxScore: 4 }] },
    { scores: [{ key: "tema", name: "Tema", score: 3, maxScore: 4 }] },
    { scores: [{ key: "tema", name: "Tema", score: 4, maxScore: 4 }] },
  ];
  const t = criterionTrends(h);
  assert.equal(t[0]!.key, "tema");
  assert.equal(t[0]!.delta, 0.5);
  assert.deepEqual(criterionTrends(h.slice(0, 1)), []);
});

test("recurring weak essay criteria need repeated evidence", () => {
  const e = (tema: number, lingua: number) => ({
    scores: [
      { key: "tema", name: "Tema", score: tema, maxScore: 4 },
      { key: "lingua", name: "Língua", score: lingua, maxScore: 6 },
    ],
  });
  assert.deepEqual(recurringWeakCriteria([e(1, 5), e(2, 5), e(4, 5)]).map((x) => x.key), ["tema"]);
  assert.deepEqual(recurringWeakCriteria([e(1, 5)]), [], "one bad essay is not a pattern");
  assert.deepEqual(recurringWeakCriteria([e(1, 1), e(1, 1), e(4, 6), e(4, 6), e(4, 6)]), [], "only the last three count");
});

test("essay calibration: error, range misses and the cheapest passing model", () => {
  const mk = (id: string, human: number, mid: number, min: number, max: number, cost: number | null) => ({
    id,
    maxScore: 10,
    human: { total: human, criteria: { tema: human / 2 } },
    ai: { totalMin: min, totalMax: max, totalMid: mid, disagreement: 0.05, criteria: { tema: mid / 2 }, criteriaMax: { tema: 5 } },
    costUsd: cost,
  });
  const good = calibrationStats([mk("a", 7, 7.5, 6.5, 8.5, 0.02), mk("b", 5, 4, 3.5, 4.5, 0.02)]);
  assert.equal(good.meanAbsTotal, 0.75);
  assert.equal(good.outsideRange, 1);
  assert.equal(good.perCriterion[0]!.meanAbs, 0.375);
  assert.equal(good.meanCostUsd, 0.02);
  const pricey = calibrationStats([mk("a", 7, 7, 6, 8, 0.08), mk("b", 5, 5, 4, 6, 0.08)]);
  assert.equal(pickModel([{ model: "opus", stats: pricey }, { model: "sonnet", stats: good }], { maxErrorShare: 0.1, maxOutsideShare: 0.5 })!.model, "sonnet");
  assert.equal(pickModel([{ model: "opus", stats: pricey }, { model: "sonnet", stats: good }], { maxErrorShare: 0.1, maxOutsideShare: 0.2 })!.model, "opus");
  assert.equal(pickModel([{ model: "sonnet", stats: good }], { maxErrorShare: 0.01, maxOutsideShare: 1 }), null);
  assert.equal(calibrationStats([]).cases, 0);
  assert.equal(calibrationStats([mk("a", 7, 7, 6, 8, null)]).meanCostUsd, null, "unknown price stays unknown");
});

/* ── offline flashcards ───────────────────────────────────────────── */

test("offline sync: duplicates once, rejects untrusted times, never moves a schedule back", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const card = { lastReviewedAt: new Date("2026-10-14T10:00:00Z"), suspended: false };
  const review = (clientId: string, iso: string) => ({ clientId, reviewedAt: new Date(iso) });
  assert.equal(decideOfflineReview(review("a", "2026-10-14T11:00:00Z"), card, new Set(), now), "apply");
  assert.equal(decideOfflineReview(review("a", "2026-10-14T11:00:00Z"), card, new Set(["a"]), now), "duplicate");
  assert.equal(decideOfflineReview(review("b", "2026-10-14T09:00:00Z"), card, new Set(), now), "record", "older than the online review");
  assert.equal(decideOfflineReview(review("c", "2026-10-15T12:00:00Z"), card, new Set(), now), "rejected", "future");
  assert.equal(decideOfflineReview(review("d", "2026-08-01T12:00:00Z"), card, new Set(), now), "rejected", "too old");
  assert.equal(decideOfflineReview(review("e", "2026-10-14T11:00:00Z"), null, new Set(), now), "rejected", "card gone or not yours");
  assert.equal(decideOfflineReview(review("f", "2026-10-14T11:00:00Z"), { ...card, suspended: true }, new Set(), now), "record");
  assert.equal(decideOfflineReview(review("g", "not a date"), card, new Set(), now), "rejected");
  assert.equal(decideOfflineReview(review("h", "2026-10-14T11:00:00Z"), { lastReviewedAt: null, suspended: false }, new Set(), now), "apply");
});

test("offline queue keeps only what the server did not acknowledge", () => {
  const q = [{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }];
  assert.deepEqual(remainingQueue(q, [{ clientId: "a", status: "applied" }, { clientId: "b", status: "duplicate" }]), [{ clientId: "c" }]);
  assert.deepEqual(remainingQueue(q, []), q, "a failed sync keeps everything");
});

/* ── editais ──────────────────────────────────────────────────────── */

test("edital links: anchors resolved, entities decoded, documents kept", () => {
  const html = `<a href="/SOO/editais/CFS%202%202027/ie.pdf">&thinsp;1. &thinsp;IE</a>
    <a href='https://x.gov.br/menu'>Menu</a><a href="#top">topo</a><a href="mailto:a@b">mail</a>
    <a href="edital_2027.pdf"><span>Edital do Concurso 2027</span></a>
    <a href="/noticias/aviso-importante">Aviso aos candidatos</a>
    <a href="/SOO/editais/CFS%202%202027/ie.pdf">duplicado</a>`;
  const links = extractLinks(html, "https://ingresso.eear.fab.mil.br/instrucoes/index.htm");
  assert.equal(links.length, 4, "hash, mailto and duplicates are dropped");
  assert.equal(links[0]!.url, "https://ingresso.eear.fab.mil.br/SOO/editais/CFS%202%202027/ie.pdf");
  assert.equal(links[0]!.text, "1. IE");
  assert.equal(links[2]!.url, "https://ingresso.eear.fab.mil.br/instrucoes/edital_2027.pdf");
  const docs = documentLinks(links);
  assert.deepEqual(docs.map((d) => d.text), ["1. IE", "Edital do Concurso 2027", "Aviso aos candidatos"]);
  assert.equal(isFileLink("https://a.br/x.PDF?download=1"), true);
});

test("edital classification with real titles from official pages", () => {
  const c = (title: string, url?: string) => classifyDocument({ title, url }).type;
  assert.equal(c("Edital do Concurso 2027", "https://www.vestibular.ita.br/instrucoes/edital_2027.pdf"), "EDITAL");
  assert.equal(c("1. IE", "https://ingresso.eear.fab.mil.br/SOO/editais/CFS%202%202027/ie.pdf"), "EDITAL");
  assert.equal(c("1ª Retificação do Edital nº 6/2025 - RFB"), "RETIFICACAO");
  assert.equal(c("Edital nº 1 – Abertura – Atualizado conforme retificações"), "EDITAL");
  assert.equal(c("Resultado Final de Aprovados (retificado em 08/10/2026)"), "RESULTADO", "a retified result is still a result");
  assert.equal(c("Homologação da Relação de Candidatos Aprovados"), "RESULTADO");
  assert.equal(c("Gabarito Definitivo dos Testes"), "RESULTADO");
  assert.equal(c("Edital de convocação para a Entrevista de Heteroidentificação (Sub Judice)"), "CONVOCACAO");
  assert.equal(c("Edital nº 4 – Locais e horário de realização das provas"), "CONVOCACAO");
  assert.equal(c("COMUNICADO - Cumprimento de Liminar"), "OUTRO");
  assert.equal(c("Caderno de Prova (1ª Fase)"), "OUTRO");
  const bare = classifyDocument({ title: "Edital nº 35/2026" });
  assert.equal(bare.type, "OUTRO");
  assert.equal(bare.confident, false, "a bare numbered edital goes to the AI to decide");
  assert.equal(classifyDocument({ title: "Documento", firstText: "EDITAL DE ABERTURA DO CONCURSO PÚBLICO" }).confident, false, "decided only by the text: not confident");
  assert.deepEqual(READ_TYPES, ["EDITAL", "RETIFICACAO"]);
});

test("robots.txt: empty Disallow allows, longest rule wins, our group beats *", () => {
  assert.equal(robotsAllows(null, "/x"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow:", "/concursos"), true);
  const fgv = "User-agent: *\nDisallow: /core/\nDisallow: /profiles/";
  assert.equal(robotsAllows(fgv, "/concursos/rfb22"), true);
  assert.equal(robotsAllows(fgv, "/core/misc/x.js"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /editais/", "/editais/a.pdf"), true);
  assert.equal(robotsAllows("User-agent: Vertice\nDisallow: /\n\nUser-agent: *\nDisallow:", "/editais"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "/a/b.pdf"), false);
});

test("military calendar dates (27 ABR 26, ranges) count as printed; the calendar annex is always read", () => {
  const annex = "ANEXO A CALENDÁRIO ANUAL DO CONCURSO DE ADMISSÃO Período de inscrições. 27 ABR 26 a 29 MAIO 26 Solicitação de isenção da taxa. 27 a 30 ABR 26 Exame Intelectual 12 e 13 SET 26";
  assert.equal(dateInText("2026-04-27", annex), true);
  assert.equal(dateInText("2026-05-29", annex), true);
  assert.equal(dateInText("2026-04-30", annex), true);
  assert.equal(dateInText("2026-09-12", annex), true);
  assert.equal(dateInText("2026-09-13", annex), true);
  assert.equal(dateInText("2026-09-14", annex), false);
  // 30 pages full of the word "inscrição" must not push the calendar out of the 24 pages sent.
  const pages = [...Array.from({ length: 41 }, () => "inscrição data resultado recurso pagamento inscrição data resultado recurso"), annex, ...Array.from({ length: 17 }, () => "texto")];
  assert.ok(relevantPages(pages, "datas").includes(42));
  assert.ok(relevantPages(pages, "etapas").includes(42));
});

test("edital checks: each stage's cronograma dates must be printed in the PDF", () => {
  const pages = ["CRONOGRAMA. Inspeção de saúde: de 01/06/2027 a 12/06/2027. Entrega de documentos até 30/07/2027."];
  const fields = toFields({
    etapas: {
      etapas: [
        { nome: "Inspeção de saúde", ordem: 2, eliminatoria: true, descricao: "Exames médicos.", cronograma: [{ evento: "Inspeção de saúde", inicio: "2027-06-01", fim: "2027-06-12" }], pagina: 1, trecho: "Inspeção de saúde: de 01/06/2027" },
        { nome: "Matrícula", ordem: 3, eliminatoria: false, descricao: "", cronograma: [{ evento: "Entrega de documentos", inicio: null, fim: "2027-07-30" }, { evento: "Apresentação", inicio: "2027-08-02", fim: null }], pagina: 1, trecho: "Entrega de documentos até 30/07/2027" },
      ],
    },
  });
  const { fields: f } = checkExtraction(fields, { pageTexts: pages, documentDate: "2027-01-10", type: "EDITAL" });
  assert.deepEqual((f["etapas"]!.value as { cronograma: unknown[] }[]).map((e) => e.cronograma.length), [1, 2]);
  assert.deepEqual(f["etapas"]!.issues, ["Matrícula, Apresentação: a data 02/08/2027 não aparece escrita no PDF."]);
});

test("edital checks: dates and numbers must be printed, order must make sense", () => {
  const pages = ["EDITAL DE ABERTURA. Inscrições de 10/03/2026 a 20 de março de 2026.", "A prova objetiva será em 05/04/2026. Total de 50 questões. Matemática: 30 questões, peso 2. Português: 20 questões."];
  const fields = toFields({
    datas: {
      datas: [
        { chave: "inscricao_inicio", rotulo: "Início", data: "2026-03-10", pagina: 1, trecho: "Inscrições de 10/03/2026" },
        { chave: "inscricao_fim", rotulo: "Fim", data: "2026-03-20", pagina: 1, trecho: "20 de março de 2026" },
        { chave: "prova_objetiva", rotulo: "Prova", data: "2026-03-01", pagina: 2, trecho: "texto que a IA inventou para justificar" },
      ],
    },
    provas: {
      disciplinas: [
        { nome: "Matemática", questoes: 30, peso: 2, notaMinima: null, dia: null, pagina: 2, trecho: "Matemática: 30 questões" },
        { nome: "Português", questoes: 25, peso: null, notaMinima: null, dia: null, pagina: 2, trecho: "Português" },
      ],
      dias: [],
      pontuacao: null,
    },
  });
  const { fields: f, issues } = checkExtraction(fields, { pageTexts: pages, documentDate: "2026-03-01", type: "EDITAL" });
  assert.deepEqual(f["data:inscricao_inicio"]!.issues, []);
  assert.deepEqual(f["data:inscricao_fim"]!.issues, [], "written out in words is found too");
  assert.ok(f["data:prova_objetiva"]!.issues.some((i) => /não aparece escrita/.test(i)));
  assert.ok(f["data:prova_objetiva"]!.issues.some((i) => /antes do fim das inscrições/.test(i)));
  assert.ok(f["data:prova_objetiva"]!.issues.some((i) => /trecho citado não foi encontrado/.test(i)));
  assert.ok(f["disciplinas"]!.issues.some((i) => /Português: o número de questões \(25\)/.test(i)));
  assert.ok(issues.some((i) => /soma das questões por disciplina \(55\) não fecha com o total impresso \(50\)/.test(i)));
  const empty = checkExtraction({}, { pageTexts: [""], documentDate: null, type: "EDITAL" });
  assert.ok(empty.issues.some((i) => /sem data de prova/.test(i)));
  assert.ok(empty.issues.some((i) => /não tem camada de texto/.test(i)));
  assert.equal(dateInText("2026-04-05", "realizada em 5 de abril de 2026"), true);
  assert.equal(numberInText(1100, "total de 1.100 vagas"), true);
  assert.equal(numberInText(10, "100 vagas"), false, "10 is not inside 100");
});

test("relevant pages pick the cronograma and its next page", () => {
  const pages = ["Capa", "Cronograma: inscrições e data da prova", "continuação da tabela", "Conteúdo programático de matemática"];
  assert.deepEqual(relevantPages(pages, "datas"), [2, 3]);
  assert.deepEqual(relevantPages(pages, "conteudo"), [4]);
  assert.deepEqual(relevantPages(["nada aqui"], "taf"), []);
});

test("retificação becomes a list of changes against the edital in force", () => {
  const current = { "data:prova_objetiva": { value: "2026-05-10", label: "Prova objetiva" }, "data:inscricao_fim": { value: "2026-03-20", label: "Fim das inscrições" } };
  const changes = compareWithCurrent(current, {
    "data:prova_objetiva": { value: "2026-05-17", label: "Prova objetiva", page: 1, quote: "17/05/2026" },
    "data:inscricao_fim": { value: "2026-03-20", label: "Fim das inscrições", page: 1, quote: "" },
    banca: { value: "Fundação X", label: "Banca organizadora", page: 2, quote: "" },
  });
  assert.equal(changes.length, 2, "unchanged values are not changes");
  assert.equal(changes[0]!.summary, "Prova objetiva: 10/05/2026 → 17/05/2026");
  assert.equal(changes[1]!.summary, "Banca organizadora: não informado → Fundação X");
  assert.equal(isDateField("data:prova_objetiva"), true);
});

test("competition status from reviewed dates, and catalog matching", () => {
  const d = { inscricaoInicio: "2026-03-10", inscricaoFim: "2026-03-20", prova: "2026-05-10", resultadoFinal: "2026-07-01" };
  assert.equal(statusFromDates(d, "2026-03-01"), "EDITAL_PUBLISHED");
  assert.equal(statusFromDates(d, "2026-03-15"), "REGISTRATION_OPEN");
  assert.equal(statusFromDates(d, "2026-04-01"), "REGISTRATION_CLOSED");
  assert.equal(statusFromDates(d, "2026-06-01"), "EXAM_DONE");
  assert.equal(statusFromDates(d, "2026-08-01"), "CONCLUDED");
  const topics = [{ id: "t1", name: "Função logarítmica" }, { id: "t2", name: "Análise combinatória" }];
  assert.equal(matchTopic("Funções logarítmicas", topics)?.id ?? null, null, "plural/singular below the threshold becomes a new topic for review");
  assert.equal(matchTopic("Análise Combinatória", topics)!.id, "t2");
  assert.equal(matchTopic("Geometria espacial", topics), null);
  const subjects = [{ id: "p", name: "Português", slug: "portugues" }, { id: "m", name: "Matemática", slug: "matematica" }];
  assert.equal(matchSubject("Língua Portuguesa", subjects)!.id, "p");
  assert.equal(matchSubject("MATEMÁTICA", subjects)!.id, "m");
  assert.equal(matchSubject("Biologia", subjects), null);
});
