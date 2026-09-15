import { PrismaClient } from "@prisma/client";
import { CATALOG_SOURCE_NOTE, COMPETITIONS, EXAM_BOARDS, SUBJECTS, type TopicSeed } from "./catalog";

const db = new PrismaClient();

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function upsertTopic(subjectId: string, parentId: string | null, name: string, order: number) {
  const slug = slugify(name);
  const existing = await db.topic.findFirst({ where: { subjectId, parentId, slug, ownerId: null } });
  if (existing) {
    return db.topic.update({ where: { id: existing.id }, data: { name, order } });
  }
  return db.topic.create({ data: { subjectId, parentId, slug, name, order } });
}

async function seedTopics(subjectId: string, topics: TopicSeed[]) {
  const ids: string[] = [];
  for (const [i, seed] of topics.entries()) {
    const [name, children] = typeof seed === "string" ? [seed, [] as string[]] : seed;
    const topic = await upsertTopic(subjectId, null, name, i);
    ids.push(topic.id);
    for (const [j, child] of children.entries()) {
      const c = await upsertTopic(subjectId, topic.id, child, j);
      ids.push(c.id);
    }
  }
  return ids;
}

async function main() {
  console.log("Seeding reference catalog…");

  for (const board of EXAM_BOARDS) {
    await db.examBoard.upsert({ where: { slug: board.slug }, update: board, create: board });
  }

  const subjectIds = new Map<string, string>();
  const topicIdsBySubject = new Map<string, string[]>();

  for (const s of SUBJECTS) {
    const existing = await db.subject.findFirst({ where: { slug: s.slug, ownerId: null } });
    const subject = existing
      ? await db.subject.update({ where: { id: existing.id }, data: { name: s.name, area: s.area } })
      : await db.subject.create({ data: { slug: s.slug, name: s.name, area: s.area } });
    subjectIds.set(s.slug, subject.id);
    topicIdsBySubject.set(s.slug, await seedTopics(subject.id, s.topics));
  }

  for (const c of COMPETITIONS) {
    const data = {
      name: c.name,
      organization: c.organization,
      position: c.position ?? null,
      kind: c.kind,
      verification: "UNVERIFIED" as const,
      sourceNote: CATALOG_SOURCE_NOTE,
    };
    const competition = await db.competition.upsert({
      where: { slug: c.slug },
      update: data,
      create: { slug: c.slug, ...data },
    });

    for (const [order, subjectSlug] of c.subjects.entries()) {
      const subjectId = subjectIds.get(subjectSlug);
      if (!subjectId) throw new Error(`Unknown subject ${subjectSlug} in ${c.slug}`);
      await db.competitionSubject.upsert({
        where: { competitionId_subjectId: { competitionId: competition.id, subjectId } },
        update: { order },
        create: { competitionId: competition.id, subjectId, order, verification: "UNVERIFIED" },
      });
      for (const topicId of topicIdsBySubject.get(subjectSlug) ?? []) {
        await db.competitionTopic.upsert({
          where: { competitionId_topicId: { competitionId: competition.id, topicId } },
          update: {},
          create: { competitionId: competition.id, topicId, verification: "UNVERIFIED" },
        });
      }
    }

    await db.competitionStage.deleteMany({ where: { competitionId: competition.id } });
    await db.competitionStage.createMany({
      data: c.stages.map((name, order) => ({ competitionId: competition.id, name, order })),
    });
  }

  // Questions come only from official past exams: npm run provas (see README).

  const [subjects, topics, competitions] = await Promise.all([
    db.subject.count({ where: { ownerId: null } }),
    db.topic.count({ where: { ownerId: null } }),
    db.competition.count({ where: { ownerId: null } }),
  ]);
  console.log(`Catalog ready: ${competitions} concursos, ${subjects} disciplinas, ${topics} tópicos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
