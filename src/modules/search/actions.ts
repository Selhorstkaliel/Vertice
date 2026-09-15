"use server";

import { db } from "@/lib/db";
import { richToPlain } from "@/engines/questions/rich-text";
import { getCurrentUser } from "@/modules/auth/session";

export interface SearchHit {
  id: string;
  group: "Concursos" | "Matérias" | "Tópicos" | "Flashcards" | "Questões";
  title: string;
  subtitle?: string;
  href: string;
}

export async function globalSearch(rawQuery: string): Promise<SearchHit[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const contains = { contains: query, mode: "insensitive" as const };
  const visible = { OR: [{ ownerId: null }, { ownerId: user.id }] };

  const [competitions, subjects, topics, flashcards, questions] = await Promise.all([
    db.competition.findMany({
      where: { AND: [visible, { OR: [{ name: contains }, { organization: contains }, { position: contains }] }] },
      select: { id: true, name: true, organization: true, enrollments: { where: { userId: user.id }, select: { id: true } } },
      take: 5,
    }),
    db.subject.findMany({ where: { AND: [visible, { name: contains }] }, select: { id: true, name: true, area: true }, take: 5 }),
    db.topic.findMany({
      where: { AND: [visible, { name: contains }] },
      select: { id: true, name: true, subject: { select: { name: true } }, parent: { select: { name: true } } },
      take: 8,
    }),
    db.flashcard.findMany({
      where: { userId: user.id, OR: [{ front: contains }, { back: contains }] },
      select: { id: true, front: true, subject: { select: { name: true } } },
      take: 5,
    }),
    db.question.findMany({
      where: { AND: [visible, { statement: contains }] },
      select: { id: true, statement: true, subject: { select: { name: true } } },
      take: 5,
    }),
  ]);

  const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  return [
    ...competitions.map((c) => ({
      id: `c-${c.id}`,
      group: "Concursos" as const,
      title: c.name,
      subtitle: `${c.organization}${c.enrollments.length ? " — inscrito" : ""}`,
      href: `/concursos/${c.id}`,
    })),
    ...subjects.map((s) => ({
      id: `s-${s.id}`,
      group: "Matérias" as const,
      title: s.name,
      subtitle: s.area ?? undefined,
      href: `/edital?materia=${s.id}`,
    })),
    ...topics.map((t) => ({
      id: `t-${t.id}`,
      group: "Tópicos" as const,
      title: t.name,
      subtitle: [t.subject.name, t.parent?.name].filter(Boolean).join(" › "),
      href: `/edital?topico=${t.id}`,
    })),
    ...flashcards.map((f) => ({
      id: `f-${f.id}`,
      group: "Flashcards" as const,
      title: clip(f.front),
      subtitle: f.subject?.name,
      href: `/flashcards/${f.id}`,
    })),
    ...questions.map((q) => ({
      id: `q-${q.id}`,
      group: "Questões" as const,
      title: clip(richToPlain(q.statement)),
      subtitle: q.subject.name,
      href: `/questoes/${q.id}`,
    })),
  ];
}
