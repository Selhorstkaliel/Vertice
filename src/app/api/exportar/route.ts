import { db } from "@/lib/db";
import { localNow } from "@/lib/time";
import { getCurrentUser, logSecurityEvent } from "@/modules/auth/session";
import { rateLimit, retryMessage } from "@/modules/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_VERSION = 1;

/** Everything the student owns, as JSON. Password hashes and session or reset tokens are never included. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const limit = await rateLimit(`export:${user.id}`, 5, 60 * 60_000);
  if (!limit.ok) return Response.json({ error: retryMessage(limit.retryAfterSec) }, { status: 429 });

  const userId = user.id;
  const where = { where: { userId } };
  const [
    enrollments,
    ownedCompetitions,
    ownedSubjects,
    routines,
    energyPeriods,
    studyPlans,
    studySessions,
    topicProgress,
    questionAttempts,
    ownedQuestions,
    errorEntries,
    flashcards,
    flashcardReviews,
    simulations,
    simulationAttempts,
    goals,
    calendarEvents,
    militaryTests,
    notifications,
    notificationPreferences,
    recommendations,
    mentorMessages,
    achievements,
    performanceSnapshots,
    weeklyReports,
    securityEvents,
    sessions,
  ] = await Promise.all([
    db.studentCompetition.findMany({ ...where, include: { stages: true, competition: { select: { id: true, name: true, organization: true, kind: true } } } }),
    db.competition.findMany({ where: { ownerId: userId }, include: { subjects: true, topics: true, stages: true } }),
    db.subject.findMany({ where: { ownerId: userId }, include: { topics: { where: { ownerId: userId } } } }),
    db.routine.findMany({ ...where, include: { blocks: true } }),
    db.energyPeriod.findMany(where),
    db.studyPlan.findMany({ ...where, include: { items: true } }),
    db.studySession.findMany(where),
    db.topicProgress.findMany(where),
    db.questionAttempt.findMany(where),
    db.question.findMany({ where: { ownerId: userId }, include: { options: true } }),
    db.errorEntry.findMany(where),
    db.flashcard.findMany(where),
    db.flashcardReview.findMany(where),
    db.simulation.findMany({ ...where, include: { subjects: true, questions: true } }),
    db.simulationAttempt.findMany({ ...where, include: { answers: true } }),
    db.goal.findMany({ ...where, include: { completions: true } }),
    db.calendarEvent.findMany(where),
    db.militaryTest.findMany({ ...where, include: { results: true } }),
    db.notification.findMany(where),
    db.notificationPreference.findMany(where),
    db.aiRecommendation.findMany(where),
    db.mentorMessage.findMany(where),
    db.userAchievement.findMany(where),
    db.performanceSnapshot.findMany(where),
    db.weeklyReport.findMany(where),
    db.securityEvent.findMany({ ...where, select: { type: true, createdAt: true } }),
    db.session.findMany({ ...where, select: { userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true } }),
  ]);

  const payload = {
    format: "vertice-export",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: "Dados da sua conta no Vértice. Senhas e tokens de acesso não são exportados.",
    account: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, isDemo: user.isDemo, createdAt: user.createdAt, onboardedAt: user.onboardedAt },
    profile: user.profile,
    enrollments,
    ownedCompetitions,
    ownedSubjects,
    routines,
    energyPeriods,
    studyPlans,
    studySessions,
    topicProgress,
    questionAttempts,
    ownedQuestions,
    errorEntries,
    flashcards,
    flashcardReviews,
    simulations,
    simulationAttempts,
    goals,
    calendarEvents,
    militaryTests,
    notifications,
    notificationPreferences,
    recommendations,
    mentorMessages,
    achievements,
    performanceSnapshots,
    weeklyReports,
    securityEvents,
    sessions,
  };

  await logSecurityEvent("DATA_EXPORTED", user.id);
  const day = localNow(user.profile?.timezone ?? undefined).key;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vertice-dados-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
