import type { Metadata } from "next";
import { SessionTimer } from "@/components/session/session-timer";
import { FreeSessionForm } from "@/components/session/free-session-form";
import { PlanItemRow } from "@/components/plan/plan-item-row";
import { ManualSessionDialog } from "@/components/plan/manual-session-dialog";
import { PageHeader, SectionTitle } from "@/components/ui/display";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getItemsForDay, getStudyPickerOptions } from "@/modules/plan/queries";
import { planItemTitle } from "@/modules/plan/titles";
import { db } from "@/lib/db";
import { addDays, localNow, startOfWeek } from "@/lib/time";
import { PLAN_ITEM_KIND_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Sessão de estudo" };

export default async function SessionPage() {
  const user = await requireOnboardedUser();
  const tz = user.profile.timezone;
  const local = localNow(tz);

  const session = await db.studySession.findFirst({
    where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
    include: { topic: { select: { name: true, parent: { select: { name: true } } } }, subject: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });

  if (session) {
    const baseSeconds =
      session.status === "RUNNING"
        ? -session.pausedSeconds
        : Math.max(0, Math.floor(((session.pausedAt ?? new Date()).getTime() - session.startedAt.getTime()) / 1000) - session.pausedSeconds);
    return (
      <SessionTimer
        session={{
          id: session.id,
          status: session.status as "RUNNING" | "PAUSED",
          title: planItemTitle({ kind: session.kind, topicName: session.topic?.name ?? null, subjectName: session.subject?.name ?? null }),
          subtitle: [PLAN_ITEM_KIND_LABEL[session.kind], session.topic?.parent?.name].filter(Boolean).join(" — ") || null,
          kind: session.kind,
          hasTopic: !!session.topicId,
          plannedMinutes: session.plannedMinutes,
          baseSeconds,
          referenceAt: session.status === "RUNNING" ? session.startedAt.toISOString() : null,
        }}
      />
    );
  }

  const [items, subjects] = await Promise.all([getItemsForDay(user.id, tz, local.key), getStudyPickerOptions(user.id)]);
  const upcoming = items.filter((i) => (i.status === "PLANNED" && i.timing !== "past") || i.status === "MISSED");
  const remainingDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(local.key), i)).filter((d) => d >= local.key);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Sessão de estudo"
        description="Nenhuma sessão em andamento. Inicie uma do plano de hoje ou uma sessão livre."
        actions={<ManualSessionDialog subjects={subjects} today={local.key} />}
      />
      <section className="flex flex-col">
        <SectionTitle>Do plano de hoje</SectionTitle>
        {upcoming.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhuma sessão pendente hoje.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {upcoming.map((item) => (
              <PlanItemRow key={item.id} item={item} remainingDays={remainingDays} compact />
            ))}
          </ul>
        )}
      </section>
      <section className="flex max-w-3xl flex-col">
        <SectionTitle>Sessão livre</SectionTitle>
        <FreeSessionForm subjects={subjects} />
      </section>
    </div>
  );
}
