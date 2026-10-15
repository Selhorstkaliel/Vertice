import { after } from "next/server";
import { AppShell } from "@/components/app/app-shell";
import { recordDailySnapshots } from "@/modules/performance/snapshots";
import { runDailyAdaptation } from "@/modules/adaptation/service";
import type { RunningSessionInfo } from "@/components/app/running-session-pill";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/modules/auth/session";
import { competitionTitle, effectiveExamDate } from "@/modules/competitions/queries";
import { PLAN_ITEM_KIND_LABEL } from "@/lib/labels";
import { essaysEnabled } from "@/lib/plan-limits";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  // History must be recorded as it happens (§73); runs after the response is sent.
  after(async () => {
    await recordDailySnapshots(user.id).catch((err) => console.error("[snapshots]", err));
    await runDailyAdaptation(user.id).catch((err) => console.error("[adaptation]", err));
  });

  const [unread, primary, running, militaryEnrollments] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.studentCompetition.findFirst({
      where: { userId: user.id, isPrimary: true },
      select: { customExamDate: true, keepCustomExamDate: true, competition: { select: { name: true, year: true, examDate: true } } },
    }),
    db.studySession.findFirst({
      where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
      select: {
        id: true,
        status: true,
        kind: true,
        startedAt: true,
        pausedAt: true,
        pausedSeconds: true,
        topic: { select: { name: true } },
        subject: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
    }),
    db.studentCompetition.count({ where: { userId: user.id, status: { not: "ARCHIVED" }, competition: { kind: "MILITARY" } } }),
  ]);

  let runningSession: RunningSessionInfo | null = null;
  if (running) {
    const label = running.topic?.name ?? running.subject?.name ?? PLAN_ITEM_KIND_LABEL[running.kind];
    runningSession =
      running.status === "RUNNING"
        ? { id: running.id, label, status: "RUNNING", baseSeconds: -running.pausedSeconds, referenceAt: running.startedAt.toISOString() }
        : {
            id: running.id,
            label,
            status: "PAUSED",
            baseSeconds: Math.max(0, Math.floor(((running.pausedAt ?? new Date()).getTime() - running.startedAt.getTime()) / 1000) - running.pausedSeconds),
            referenceAt: null,
          };
  }

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isDemo: user.isDemo,
        showMilitary: user.profile.track !== "PUBLIC" || militaryEnrollments > 0,
        isAdmin: user.isAdmin,
        showEssays: essaysEnabled(user),
        primaryCompetition: primary ? competitionTitle(primary.competition, effectiveExamDate(primary).date) : null,
        unreadNotifications: unread,
      }}
      runningSession={runningSession}
    >
      {children}
    </AppShell>
  );
}
