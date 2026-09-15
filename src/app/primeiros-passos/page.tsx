import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { db } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { firstName } from "@/lib/format";

export const metadata: Metadata = { title: "Primeiros passos" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/painel");

  const competitions = await db.competition.findMany({
    where: { ownerId: null, forkedFromId: null },
    select: {
      id: true,
      name: true,
      organization: true,
      position: true,
      kind: true,
      examDate: true,
      subjects: { select: { subject: { select: { id: true, name: true } } }, orderBy: { order: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  const subjects = await db.subject.findMany({ where: { ownerId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="min-h-dvh px-4 py-6 sm:px-10">
      <Logo />
      <main className="mx-auto flex max-w-xl flex-col gap-8 pt-12 pb-20 sm:pt-20">
        <p className="text-base text-fg-muted">
          {firstName(user.name)}, algumas perguntas para montar sua preparação. Leva cerca de dois minutos.
        </p>
        <OnboardingWizard
          competitions={competitions.map((c) => ({
            id: c.id,
            name: c.name,
            organization: c.organization,
            position: c.position,
            kind: c.kind,
            examDate: c.examDate?.toISOString().slice(0, 10) ?? null,
            subjects: c.subjects.map((s) => s.subject),
          }))}
          subjects={subjects}
        />
      </main>
    </div>
  );
}
