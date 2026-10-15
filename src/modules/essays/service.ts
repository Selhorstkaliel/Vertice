import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, dbDateToKey, localNow, startOfWeek, zonedToUtc } from "@/lib/time";
import { limitsFor } from "@/lib/plan-limits";
import { essayCadence, DEFAULT_ESSAY_MINUTES } from "@/engines/essays/cadence";
import { criterionTrends, recurringWeakCriteria, type RubricCriterion } from "@/engines/essays/correction";
import { effectiveExamDate } from "@/modules/competitions/queries";
import { findPlacements } from "@/modules/plan/service";
import { notify } from "@/modules/notifications/service";

export const criteriaSchema = z
  .array(
    z.object({
      key: z.string().trim().regex(/^[a-z0-9_-]{1,30}$/, "Use letras minúsculas, números, - ou _."),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().min(5).max(600),
      maxScore: z.number().positive().max(1000),
      weight: z.number().positive().max(10).default(1),
    }),
  )
  .min(1)
  .max(10)
  .refine((list) => new Set(list.map((c) => c.key)).size === list.length, "Chaves de critério repetidas.");

export function parseCriteria(value: unknown): RubricCriterion[] {
  const parsed = criteriaSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const supportTextsSchema = z.array(z.object({ title: z.string(), text: z.string(), source: z.string().nullable().optional(), generated: z.boolean() }));
export type SupportText = z.infer<typeof supportTextsSchema>[number];
export function parseSupportTexts(value: unknown): SupportText[] {
  const parsed = supportTextsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The rubric that grades essays for a competition: the latest published one of its catalog origin. */
export async function publishedRubricFor(competitionId: string) {
  const c = await db.competition.findUnique({ where: { id: competitionId }, select: { id: true, name: true, forkedFromId: true } });
  if (!c) return null;
  const rubric = await db.essayRubric.findFirst({
    where: { competitionId: c.forkedFromId ?? c.id, publishedAt: { not: null } },
    orderBy: [{ year: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }],
    include: { competition: { select: { name: true } } },
  });
  return rubric ? { ...rubric, criteria: parseCriteria(rubric.criteria) } : null;
}

/** Student enrollments whose competition has an essay rubric published. */
export async function essayEnrollments(userId: string) {
  const enrollments = await db.studentCompetition.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, isPrimary: true, customExamDate: true, keepCustomExamDate: true, competitionId: true, competition: { select: { id: true, name: true, examDate: true, verification: true, forkedFromId: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const out = [];
  for (const e of enrollments) {
    const rubric = await publishedRubricFor(e.competitionId);
    if (rubric) out.push({ ...e, rubric, sourceCompetitionId: e.competition.forkedFromId ?? e.competition.id });
  }
  return out;
}

function monthStart(tz: string) {
  const key = localNow(tz).key;
  return zonedToUtc(`${key.slice(0, 7)}-01`, 0, tz);
}

export async function essayQuota(user: { id: string }, tz: string) {
  const since = monthStart(tz);
  const limits = limitsFor(user);
  const [corrections, rewrites] = await Promise.all([
    db.essayCorrection.count({ where: { essay: { userId: user.id }, createdAt: { gte: since } } }),
    db.essayParagraphRewrite.count({ where: { essay: { userId: user.id }, createdAt: { gte: since } } }),
  ]);
  return {
    corrections,
    correctionsLimit: limits.essayCorrectionsPerMonth,
    correctionsLeft: Math.max(0, limits.essayCorrectionsPerMonth - corrections),
    rewrites,
    rewritesLimit: limits.essayRewritesPerMonth,
    rewritesLeft: Math.max(0, limits.essayRewritesPerMonth - rewrites),
  };
}

/** Stable pick for the week among published themes the student has not written yet. */
export async function themeOfTheWeek(userId: string, competitionId: string, weekStart: string) {
  const [themes, done] = await Promise.all([
    db.essayTheme.findMany({ where: { competitionId, status: "PUBLISHED" }, select: { id: true, title: true, prompt: true, origin: true, year: true, supportTexts: true }, orderBy: { createdAt: "asc" } }),
    db.essay.findMany({ where: { userId, themeId: { not: null }, status: { in: ["SUBMITTED", "CORRECTED"] } }, select: { themeId: true }, distinct: ["themeId"] }),
  ]);
  const used = new Set(done.map((d) => d.themeId));
  const fresh = themes.filter((t) => !used.has(t.id));
  if (fresh.length === 0) return null;
  let hash = 0;
  for (const ch of `${userId}:${weekStart}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const t = fresh[hash % fresh.length]!;
  return { ...t, supportTexts: parseSupportTexts(t.supportTexts) };
}

/** Essays per week for the student, fitted to this week's free routine time. */
export async function cadenceFor(user: { id: string; profile: { timezone: string; dailyStudyLimitMin: number } }, enrollment: { customExamDate: Date | null; competition: { examDate: Date | null; verification: string } }) {
  const tz = user.profile.timezone;
  const today = localNow(tz).key;
  const weekStart = startOfWeek(today);
  const exam = effectiveExamDate(enrollment);
  // A catalog date counts only when verified; the student's own date always counts.
  const examKey = exam.date && (!exam.official || enrollment.competition.verification === "VERIFIED") ? dbDateToKey(exam.date) : null;
  const [doneThisWeek, fit] = await Promise.all([
    db.essay.count({ where: { userId: user.id, status: { in: ["SUBMITTED", "CORRECTED"] }, submittedAt: { gte: zonedToUtc(weekStart, 0, tz) } } }),
    findPlacements(
      user.id,
      [0, 1, 2].map((i) => ({ id: `w${i}`, minutes: DEFAULT_ESSAY_MINUTES, kind: "WRITING" as const })),
    ).catch(() => null),
  ]);
  const routineBlocks = await db.routineBlock.count({ where: { routine: { userId: user.id, isActive: true } } });
  return essayCadence({
    today,
    examDate: examKey,
    weeklyFreeMinutes: routineBlocks === 0 || !fit ? null : fit.placements.size * DEFAULT_ESSAY_MINUTES,
    dailyLimitMinutes: user.profile.dailyStudyLimitMin,
    doneThisWeek,
  });
}

const correctionScoresSchema = z.array(z.object({ key: z.string(), name: z.string(), score: z.number(), maxScore: z.number(), min: z.number(), max: z.number(), excerpt: z.string().nullable(), comment: z.string(), weight: z.number() }));
export function parseScores(value: unknown) {
  const parsed = correctionScoresSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function essayHistory(userId: string) {
  const essays = await db.essay.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      submittedAt: true,
      timed: true,
      originalId: true,
      theme: { select: { title: true, origin: true } },
      rubric: { select: { competition: { select: { name: true } } } },
      corrections: { select: { totalMin: true, totalMax: true, totalMid: true, maxScore: true, uncertain: true, scores: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const corrected = essays
    .filter((e) => e.corrections[0])
    .map((e) => ({ id: e.id, at: e.corrections[0]!.createdAt, scores: parseScores(e.corrections[0]!.scores) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return { essays, trends: criterionTrends(corrected), corrected };
}

/**
 * Criteria that keep costing points become one personal-error flashcard each
 * (tag `redacao:<key>`), never duplicated.
 */
export async function syncEssayFlashcards(userId: string) {
  const { corrected } = await essayHistory(userId);
  const weak = recurringWeakCriteria(corrected);
  if (weak.length === 0) return 0;
  const subject = await db.subject.findFirst({ where: { slug: "redacao", ownerId: null }, select: { id: true } });
  let created = 0;
  for (const w of weak) {
    const tag = `redacao:${w.key}`;
    const exists = await db.flashcard.findFirst({ where: { userId, tags: { has: tag } }, select: { id: true } });
    if (exists) continue;
    const comments = await db.essayCorrection.findMany({
      where: { essay: { userId } },
      select: { scores: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const notes = comments
      .flatMap((c) => parseScores(c.scores).filter((s) => s.key === w.key).map((s) => s.comment))
      .filter(Boolean)
      .slice(0, 3);
    await db.flashcard.create({
      data: {
        userId,
        front: `Redação, ${w.name}: o que tem tirado pontos nas suas últimas redações?`,
        back: [`Nas suas últimas correções, ${w.name} ficou abaixo da metade em ${w.hits} redações.`, ...notes.map((n) => `• ${n}`)].join("\n\n"),
        type: "PERSONAL_ERROR",
        origin: "MANUAL",
        subjectId: subject?.id ?? null,
        tags: [tag, "redacao"],
      },
    });
    created++;
  }
  return created;
}

/** Weekly theme notice and a mid-week reminder of essays still due (deduplicated). */
export async function generateEssayNotices(user: { id: string; profile: { timezone: string; dailyStudyLimitMin: number } }) {
  const enrollments = await essayEnrollments(user.id);
  const primary = enrollments[0];
  if (!primary) return 0;
  const tz = user.profile.timezone;
  const today = localNow(tz).key;
  const weekStart = startOfWeek(today);
  const notices = [];
  const theme = await themeOfTheWeek(user.id, primary.sourceCompetitionId, weekStart);
  if (theme) notices.push({ type: "ESSAY" as const, title: `Tema da semana: ${theme.title}`, body: theme.origin === "OFFICIAL" ? `Tema oficial${theme.year ? ` (${theme.year})` : ""}.` : "Tema gerado por IA e revisado.", href: "/redacao", dedupeKey: `essay-theme:${weekStart}` });
  const cadence = await cadenceFor(user, primary);
  if (cadence.remainingThisWeek > 0 && today >= addDays(weekStart, 3)) {
    notices.push({
      type: "ESSAY" as const,
      title: cadence.remainingThisWeek === 1 ? "Falta 1 redação nesta semana." : `Faltam ${cadence.remainingThisWeek} redações nesta semana.`,
      body: cadence.reason,
      href: "/redacao",
      dedupeKey: `essay-due:${weekStart}`,
    });
  }
  return notify(user.id, notices);
}
