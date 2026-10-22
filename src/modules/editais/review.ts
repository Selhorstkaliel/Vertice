import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/action";
import { dbDateToKey, keyToDbDate, localNow } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { describeValue, isDateField } from "@/engines/editais/changes";
import { matchSubject, matchTopic, statusFromDates } from "@/engines/editais/status";
import { interpretTafIndex } from "@/engines/military/taf-standards";
import { DATE_LABEL, type DateKey, type ExtractedFields } from "@/engines/editais/fields";
import { notify } from "@/modules/notifications/service";
import { syncStageItems } from "@/modules/military/stages";
import { currentPublishedFields, parseFields } from "./published";
import { followersOf } from "./shared";

/* ── review ───────────────────────────────────────────────────────── */

export async function reviewField(documentId: string, key: string, input: { status: "APPROVED" | "REJECTED" | "PENDING"; value?: unknown }, reviewerId: string) {
  const ex = await db.editalExtraction.findUnique({ where: { documentId } });
  if (!ex || ex.publishedAt) throw new DomainError("Extração não encontrada ou já publicada.");
  const fields = parseFields(ex.fields);
  const f = fields[key];
  if (!f) throw new DomainError("Campo não encontrado.");
  if (input.value !== undefined) {
    f.value = input.value;
    f.edited = true;
  }
  f.status = input.status;
  await db.editalExtraction.update({ where: { documentId }, data: { fields: fields as unknown as Prisma.InputJsonValue, reviewedById: reviewerId, reviewedAt: new Date() } });
}

export async function reviewChange(changeId: string, status: "APPROVED" | "REJECTED" | "PENDING") {
  const change = await db.editalChange.findUnique({ where: { id: changeId }, include: { document: { select: { status: true } } } });
  if (!change || change.document.status === "PUBLISHED") throw new DomainError("Mudança não encontrada ou já publicada.");
  await db.editalChange.update({ where: { id: changeId }, data: { status } });
}

/* ── publication ──────────────────────────────────────────────────── */

const brDate = (iso: string) => iso.split("-").reverse().join("/");
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const DEADLINE_ITEMS: Record<string, { title: string; kind: "REGISTRATION_DEADLINE" | "APPEAL_DEADLINE"; stage: RegExp }> = {
  "data:inscricao_fim": { title: "Fim das inscrições", kind: "REGISTRATION_DEADLINE", stage: /inscri/ },
  "data:isencao_fim": { title: "Fim do pedido de isenção da taxa", kind: "REGISTRATION_DEADLINE", stage: /inscri/ },
  "data:pagamento_fim": { title: "Último dia para pagar a taxa de inscrição", kind: "REGISTRATION_DEADLINE", stage: /inscri/ },
  "data:recurso_fim": { title: "Fim do prazo de recurso", kind: "APPEAL_DEADLINE", stage: /prova|exame intelectual|objetiva/ },
};
/** Kind of a cronograma event, from its words. */
function stageItemKind(text: string): "DOCUMENT" | "HEALTH_EXAM" | "REGISTRATION_DEADLINE" | "APPEAL_DEADLINE" | "OTHER" {
  const t = norm(text);
  if (/recurso/.test(t)) return "APPEAL_DEADLINE";
  if (/inscri|isencao|taxa/.test(t)) return "REGISTRATION_DEADLINE";
  if (/inspecao|saude|exame medico|exames medicos|odonto/.test(t)) return "HEALTH_EXAM";
  if (/document|matricula|apresentacao|entrega/.test(t)) return "DOCUMENT";
  return "OTHER";
}

/** Student stages whose date follows the exam date. */
const EXAM_STAGE = /prova objetiva|exame intelectual|prova escrita|\bprova\b/;

interface AppliedValues {
  [field: string]: unknown;
}

/** The values a publication puts in force: approved fields (edital) or approved changes (retificação). */
async function valuesToApply(documentId: string, type: string, fields: ExtractedFields): Promise<AppliedValues> {
  if (type === "RETIFICACAO") {
    const changes = await db.editalChange.findMany({ where: { documentId, status: "APPROVED" } });
    return Object.fromEntries(changes.map((c) => [c.field, c.after]));
  }
  return Object.fromEntries(Object.entries(fields).filter(([, f]) => f.status === "APPROVED").map(([k, f]) => [k, f.value]));
}

/** Stage a cronograma date belongs to, from its label: first the specific stages, then the exam. */
const DATE_STAGE: [RegExp, RegExp][] = [
  [/inscri|isencao|taxa|pagamento/, /inscri/],
  [/inspecao|saude|medic|odonto/, /inspecao|saude/],
  [/aptidao|fisic|\btaf\b|\btfm\b/, /aptidao|fisic|\btaf\b/],
  [/psicol/, /psicol/],
  [/heteroident|verificacao documental|documenta|comprovacao/, /document|verificacao/],
  [/matricula|apresentacao|incorporacao|concentracao|habilitacao/, /matricula|incorpora|concentra|habilita/],
  [/prova|exame|fase|escolaridade|objetiva|discursiva|redacao|gabarito|recurso|resultado/, /prova|exame intelectual|escolaridade|objetiva|fase/],
];

async function applyToCatalog(competitionId: string, values: AppliedValues, doc: { url: string; title: string; publishedAt: Date | null }, today: string, labels: Record<string, string> = {}) {
  const competition = await db.competition.findUniqueOrThrow({
    where: { id: competitionId },
    include: { subjects: { include: { subject: true } }, stages: { orderBy: { order: "asc" } }, topics: { include: { topic: { select: { id: true, name: true, subjectId: true } } } } },
  });
  const year = typeof values["data:prova_objetiva"] === "string" ? Number((values["data:prova_objetiva"] as string).slice(0, 4)) : (doc.publishedAt?.getUTCFullYear() ?? Number(today.slice(0, 4)));
  const source = { sourceUrl: doc.url, sourceYear: year, verification: "VERIFIED" as const };

  // Exam date, status, banca and provenance.
  const inForce = { ...Object.fromEntries(Object.entries(await currentPublishedFields(competitionId)).map(([k, v]) => [k, v.value])), ...values };
  const d = (k: string) => (typeof inForce[k] === "string" ? (inForce[k] as string) : null);
  const banca = typeof values["banca"] === "string" ? await db.examBoard.findFirst({ where: { OR: [{ name: { equals: values["banca"] as string, mode: "insensitive" } }, { fullName: { equals: values["banca"] as string, mode: "insensitive" } }] }, select: { id: true } }) : null;
  await db.competition.update({
    where: { id: competitionId },
    data: {
      ...(typeof values["data:prova_objetiva"] === "string" ? { examDate: keyToDbDate(values["data:prova_objetiva"] as string) } : {}),
      status: statusFromDates({ inscricaoInicio: d("data:inscricao_inicio"), inscricaoFim: d("data:inscricao_fim"), prova: d("data:prova_objetiva"), resultadoFinal: d("data:resultado_final") }, today),
      verification: "VERIFIED",
      editalUrl: doc.url,
      year: Number.isFinite(year) ? year : competition.year,
      sourceNote: `Dados conferidos pela equipe do Vértice no documento oficial “${doc.title}”${doc.publishedAt ? `, publicado em ${brDate(dbDateToKey(doc.publishedAt))}` : ""}. Fonte: ${doc.url}`,
      ...(banca ? { examBoardId: banca.id } : {}),
    },
  });

  // Subjects: question counts and weights.
  const disciplinas = values["disciplinas"] as { nome: string; questoes: number | null; peso: number | null; dia?: number | null }[] | undefined;
  const dias = values["dias"] as { dia: number; duracaoMinutos: number }[] | undefined;
  const subjects = competition.subjects.map((s) => ({ id: s.subjectId, name: s.subject.name, slug: s.subject.slug }));
  for (const item of disciplinas ?? []) {
    const s = matchSubject(item.nome, subjects);
    if (!s) continue;
    await db.competitionSubject.update({
      where: { competitionId_subjectId: { competitionId, subjectId: s.id } },
      data: { ...(item.peso !== null ? { weight: item.peso } : {}), ...(item.questoes !== null ? { questionCount: item.questoes } : {}), verification: "VERIFIED" },
    });
  }

  // Scoring rule of this year.
  const pont = values["pontuacao"] as { modo: "ACERTOS" | "DESCONTO"; descontoPorErro: number | null; notaMinimaTotal: number | null; notaMaxima: number | null } | undefined;
  if (pont) {
    const ruleSubjects = (disciplinas ?? []).flatMap((item) => {
      const s = matchSubject(item.nome, subjects);
      return s && item.peso !== null ? [{ subjectId: s.id, weight: item.peso || 1, questions: item.questoes, day: item.dia ?? null }] : [];
    });
    const days = (dias ?? []).filter((d) => d.dia >= 1 && d.duracaoMinutos >= 10).map((d) => ({ day: d.dia, durationMinutes: d.duracaoMinutos }));
    const existing = await db.scoringRule.findFirst({ where: { competitionId, year }, select: { id: true } });
    const data = {
      mode: pont.modo === "DESCONTO" ? ("PENALTY" as const) : ("RIGHT_COUNT" as const),
      wrongPenalty: pont.modo === "DESCONTO" ? (pont.descontoPorErro ?? 1) : null,
      subjects: ruleSubjects,
      minTotalShare: pont.notaMinimaTotal !== null && pont.notaMaxima ? pont.notaMinimaTotal / pont.notaMaxima : null,
      maxScore: pont.notaMaxima,
      // The simulado of each day uses its official time; a one-day exam also sets the total.
      ...(days.length ? { days, ...(days.length === 1 ? { durationMinutes: days[0]!.durationMinutes } : {}) } : {}),
      sourceUrl: doc.url,
      sourceNote: `Do documento “${doc.title}”.`,
      verification: "VERIFIED" as const,
    };
    if (existing) await db.scoringRule.update({ where: { id: existing.id }, data });
    else await db.scoringRule.create({ data: { competitionId, year, ...data } });
  }

  // Stages: update order and description, create the missing ones; never delete.
  const etapas = values["etapas"] as { nome: string; ordem: number; eliminatoria: boolean; descricao: string; cronograma?: { evento: string; inicio: string | null; fim: string | null }[] }[] | undefined;
  for (const e of etapas ?? []) {
    const found = competition.stages.find((s) => norm(s.name) === norm(e.nome));
    const description = `${e.eliminatoria ? "Eliminatória. " : ""}${e.descricao}`.trim();
    if (found) await db.competitionStage.update({ where: { id: found.id }, data: { order: e.ordem, description } });
    else await db.competitionStage.create({ data: { competitionId, name: e.nome, order: e.ordem, description } });
  }
  // Stages may share an order (catalog + edital names): break ties by id so every publication picks the same stage.
  const stages = await db.competitionStage.findMany({ where: { competitionId }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  const stageFor = (re: RegExp, fallback: RegExp | null = null) => stages.find((s) => re.test(norm(s.name))) ?? (fallback ? stages.find((s) => fallback.test(norm(s.name))) : null) ?? stages[0] ?? null;

  // Deadlines and documents become stage checklist items (verified, with source).
  const upsertItem = async (stageId: string, title: string, kind: "DOCUMENT" | "HEALTH_EXAM" | "REGISTRATION_DEADLINE" | "APPEAL_DEADLINE" | "OTHER", due: string | null) => {
    const item = await db.competitionStageItem.findFirst({ where: { stageId, title } });
    const data = { kind, dueDate: due ? keyToDbDate(due) : null, ...source };
    const saved = item ? await db.competitionStageItem.update({ where: { id: item.id }, data }) : await db.competitionStageItem.create({ data: { stageId, title, ...data } });
    // Copies whose date the student did not change follow the official one.
    await db.studentStageItem.updateMany({ where: { catalogItemId: saved.id, dateFromCatalog: true }, data: { dueDate: saved.dueDate, verification: "VERIFIED", sourceUrl: doc.url, sourceYear: year } });
  };
  // When each stage happens: every cronograma date that lands in it.
  const stageDates = new Map<string, string[]>();
  const dateIn = (stageId: string, ...days: (string | null | undefined)[]) => stageDates.set(stageId, [...(stageDates.get(stageId) ?? []), ...days.filter((d): d is string => !!d)]);
  for (const [field, spec] of Object.entries(DEADLINE_ITEMS)) {
    if (typeof values[field] !== "string") continue;
    const stage = stageFor(spec.stage);
    if (stage) {
      await upsertItem(stage.id, spec.title, spec.kind, values[field] as string);
      dateIn(stage.id, values[field] as string);
    }
  }
  // Every other approved date of the cronograma ("2ª fase", "inspeção de saúde", "matrícula"...) is an item of its stage.
  const dated = Object.entries(values).filter(([k, v]) => k.startsWith("data:") && !DEADLINE_ITEMS[k] && typeof v === "string") as [string, string][];
  const titleOf = (k: string) => labels[k] ?? (DATE_LABEL[k.slice(5).replace(/:\d+$/, "") as DateKey] || "Data do cronograma");
  // Titles used more than once (including the fixed deadlines above) get their date, so one never overwrites another.
  const allTitles = [...Object.entries(DEADLINE_ITEMS).filter(([k]) => typeof values[k] === "string").map(([, spec]) => spec.title), ...dated.map(([k]) => titleOf(k))];
  const repeated = new Set(allTitles.filter((t, i) => allTitles.indexOf(t) !== i));
  for (const [k, due] of dated) {
    const label = titleOf(k);
    const words = norm(label);
    const target = DATE_STAGE.find(([re]) => re.test(words));
    const stage = (target && stages.find((s) => target[1].test(norm(s.name)))) ?? stageFor(EXAM_STAGE);
    if (stage) {
      await upsertItem(stage.id, (repeated.has(label) ? `${label} (${brDate(due)})` : label).slice(0, 200), stageItemKind(label), due);
      dateIn(stage.id, due);
    }
  }

  // Each stage's cronograma: every dated event becomes an item of that stage, due on its last day.
  for (const e of etapas ?? []) {
    const stage = stages.find((s) => norm(s.name) === norm(e.nome));
    if (!stage) continue;
    for (const c of e.cronograma ?? []) {
      const due = c.fim ?? c.inicio;
      if (!due) continue;
      const title = c.inicio && c.fim && c.inicio !== c.fim ? `${c.evento} (de ${brDate(c.inicio)} a ${brDate(c.fim)})` : c.evento;
      await upsertItem(stage.id, title.slice(0, 200), stageItemKind(`${c.evento} ${e.nome}`), due);
      dateIn(stage.id, c.inicio, c.fim);
    }
  }
  for (const stage of stages) {
    const days = (stageDates.get(stage.id) ?? []).sort();
    // The exam stage starts on the exam day itself, not on the announcement of the exam venues.
    const exam = EXAM_STAGE.test(norm(stage.name)) && typeof values["data:prova_objetiva"] === "string" ? (values["data:prova_objetiva"] as string) : null;
    if (!days.length && !exam) continue;
    await db.competitionStage.update({ where: { id: stage.id }, data: { startDate: keyToDbDate(exam ?? days[0]!), endDate: keyToDbDate(days.at(-1) ?? exam!) } });
  }
  const documentos = values["documentos"] as { nome: string; tipo: "DOCUMENTO" | "EXAME_SAUDE"; etapa: string; prazo: string | null }[] | undefined;
  for (const doc_ of documentos ?? []) {
    const stage = stages.find((s) => norm(s.name) === norm(doc_.etapa)) ?? stageFor(doc_.tipo === "EXAME_SAUDE" ? /inspecao|saude/ : /document|matricula|verificacao/, /inscri/);
    if (stage) await upsertItem(stage.id, doc_.nome, doc_.tipo === "EXAME_SAUDE" ? "HEALTH_EXAM" : "DOCUMENT", doc_.prazo);
  }

  // Physical test indices, per sex and age range: kept in sync with the edital in force.
  const taf = values["taf"] as { prova: string; sexo: "MASCULINO" | "FEMININO" | "AMBOS"; faixaEtaria: string | null; indice: string; unidade: string }[] | undefined;
  if (taf?.length) {
    const existing = await db.competitionTafStandard.findMany({ where: { competitionId }, select: { id: true, test: true, sex: true, ageRange: true } });
    const keep = new Set<string>();
    for (const [order, t] of taf.entries()) {
      const sex = t.sexo === "MASCULINO" ? ("MALE" as const) : t.sexo === "FEMININO" ? ("FEMALE" as const) : ("BOTH" as const);
      const read = interpretTafIndex(t.prova, t.indice, t.unidade);
      const data = { year, test: t.prova.slice(0, 200), sex, ageRange: t.faixaEtaria, index: t.indice.slice(0, 80), unitText: t.unidade.slice(0, 40), ...read, order, sourceUrl: doc.url, verification: "VERIFIED" as const };
      const found = existing.find((e) => norm(e.test) === norm(t.prova) && e.sex === sex && (e.ageRange ?? "") === (t.faixaEtaria ?? ""));
      const saved = found ? await db.competitionTafStandard.update({ where: { id: found.id }, data }) : await db.competitionTafStandard.create({ data: { competitionId, ...data } });
      keep.add(saved.id);
    }
    await db.competitionTafStandard.deleteMany({ where: { competitionId, id: { notIn: [...keep] } } });
  }

  // Syllabus: link catalog topics; items without a match become topics (approved in review).
  let topicsChanged = false;
  for (const [field, raw] of Object.entries(values)) {
    if (!field.startsWith("conteudo:") || !Array.isArray(raw)) continue;
    const subject = matchSubject(field.slice("conteudo:".length), subjects);
    if (!subject) continue;
    const catalog = await db.topic.findMany({ where: { subjectId: subject.id, ownerId: null }, select: { id: true, name: true } });
    const linked = new Set(competition.topics.map((t) => t.topic.id));
    for (const item of raw as string[]) {
      const name = item.trim().slice(0, 200);
      if (!name) continue;
      let topic = matchTopic(name, catalog);
      if (!topic) {
        const base = slugify(name) || "topico";
        const clash = await db.topic.findFirst({ where: { subjectId: subject.id, parentId: null, slug: base }, select: { id: true, name: true } });
        const created = clash ?? (await db.topic.create({ data: { subjectId: subject.id, name, slug: base, order: catalog.length + 1 }, select: { id: true, name: true } }));
        topic = { id: created.id, name: created.name, score: 1 };
        catalog.push({ id: created.id, name: created.name });
      }
      if (!linked.has(topic.id)) {
        await db.competitionTopic.upsert({
          where: { competitionId_topicId: { competitionId, topicId: topic.id } },
          update: { verification: "VERIFIED" },
          create: { competitionId, topicId: topic.id, verification: "VERIFIED" },
        });
        linked.add(topic.id);
        topicsChanged = true;
      } else {
        await db.competitionTopic.update({ where: { competitionId_topicId: { competitionId, topicId: topic.id } }, data: { verification: "VERIFIED" } });
      }
    }
  }

  // Essay criteria: a draft rubric, published by the admin in Rubricas e temas.
  const redacao = values["redacao"] as { tipoTexto: string; linhasMin: number | null; linhasMax: number | null; criterios: { nome: string; descricao: string; notaMaxima: number; peso: number | null }[]; zera: string[] } | undefined;
  if (redacao && redacao.criterios.length) {
    const used = new Set<string>();
    const criteria = redacao.criterios.map((c, i) => {
      let key = slugify(c.nome).replace(/-/g, "_").slice(0, 24) || `c${i + 1}`;
      while (used.has(key)) key = `${key}_${i}`;
      used.add(key);
      return { key, name: c.nome.slice(0, 80), description: (c.descricao || c.nome).slice(0, 600), maxScore: c.notaMaxima || 1, weight: c.peso ?? 1 };
    });
    await db.essayRubric.create({
      data: { competitionId, year, editalUrl: doc.url, textType: redacao.tipoTexto.slice(0, 200), minLines: redacao.linhasMin, maxLines: redacao.linhasMax, criteria, zeroingRules: redacao.zera.slice(0, 20), verified: true },
    });
  }
  return { topicsChanged };
}

/**
 * Publishes a reviewed document: applies the approved values to the catalog
 * competition, then tells the students who follow it what changed. Dates the
 * student typed are never replaced: they are asked.
 */
export async function publishDocument(documentId: string, adminId: string) {
  const doc = await db.editalDocument.findUnique({ where: { id: documentId }, include: { extraction: true, competition: { select: { id: true, name: true, ownerId: true } } } });
  if (!doc?.extraction || doc.status !== "REVIEW") throw new DomainError("Documento não está em revisão.");
  if (doc.competition.ownerId) throw new DomainError("Só concursos do catálogo recebem dados de edital.");
  const fields = parseFields(doc.extraction.fields);
  const pendingFields = Object.values(fields).filter((f) => f.status === "PENDING").length;
  const pendingChanges = await db.editalChange.count({ where: { documentId, status: "PENDING" } });
  if (pendingFields + pendingChanges > 0) throw new DomainError(`Revise todos os itens antes de publicar (${pendingFields + pendingChanges} pendentes).`);
  const values = await valuesToApply(documentId, doc.type, fields);
  if (Object.keys(values).length === 0) throw new DomainError("Nenhum campo aprovado para publicar.");

  const before = await currentPublishedFields(doc.competitionId);
  const today = localNow().key;
  // Free-text dates ("outra") carry their meaning in the label the edital gave them.
  const labels: Record<string, string> = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.label]));
  if (doc.type === "RETIFICACAO") for (const c of await db.editalChange.findMany({ where: { documentId, status: "APPROVED" }, select: { field: true, label: true } })) labels[c.field] = c.label;
  const { topicsChanged } = await applyToCatalog(doc.competitionId, values, doc, today, labels);
  await db.$transaction([
    db.editalExtraction.update({ where: { documentId }, data: { publishedAt: new Date(), reviewedById: adminId, reviewedAt: new Date() } }),
    db.editalDocument.update({ where: { id: documentId }, data: { status: "PUBLISHED" } }),
  ]);

  // What changed for the student, with before → after for dates.
  const dateChanges = Object.entries(values)
    .filter(([k, v]) => isDateField(k) && typeof v === "string" && before[k] && before[k].value !== v)
    .map(([k, v]) => `${before[k]!.label}: ${describeValue(k, before[k]!.value)} → ${describeValue(k, v)}`);
  const newExam = typeof values["data:prova_objetiva"] === "string" ? (values["data:prova_objetiva"] as string) : null;
  const previousExam = (before["data:prova_objetiva"]?.value as string | undefined) ?? null;

  const followers = await followersOf(doc.competitionId);
  for (const f of followers) {
    const notices = [];
    notices.push({
      type: "EDITAL_UPDATE" as const,
      title: `${doc.competition.name}: datas e conteúdo do edital atualizados`,
      body: dateChanges.length ? `Mudou: ${dateChanges.slice(0, 3).join("; ")}.` : `Dados conferidos no documento “${doc.title}”.`,
      href: `/editais?concurso=${doc.competitionId}`,
      dedupeKey: `edital-update:${documentId}`,
    });
    if (newExam) {
      // Student stages that follow the exam date move with it, unless the student set their own.
      const stages = await db.studentStage.findMany({ where: { studentCompetitionId: f.id }, select: { id: true, name: true, date: true } });
      for (const s of stages) {
        const followsOfficial = !s.date || (previousExam !== null && dbDateToKey(s.date) === previousExam);
        if (EXAM_STAGE.test(norm(s.name)) && followsOfficial) await db.studentStage.update({ where: { id: s.id }, data: { date: keyToDbDate(newExam) } });
      }
      if (f.customExamDate && dbDateToKey(f.customExamDate) !== newExam) {
        await db.studentCompetition.update({ where: { id: f.id }, data: { keepCustomExamDate: true } });
        notices.push({
          type: "EDITAL_UPDATE" as const,
          title: `Data oficial da prova publicada: ${brDate(newExam)}`,
          body: `Você tinha informado ${brDate(dbDateToKey(f.customExamDate))}. Sua data continua valendo até você escolher usar a oficial.`,
          href: `/concursos/${f.competitionId}`,
          dedupeKey: `edital-exam-date:${documentId}:${f.id}`,
        });
      }
    }
    if (topicsChanged) {
      notices.push({
        type: "EDITAL_UPDATE" as const,
        title: `${doc.competition.name}: conteúdo programático atualizado`,
        body: "O edital verticalizado já mostra os tópicos do edital. O plano não muda sozinho: recalcule quando quiser incluir os novos tópicos.",
        href: "/plano",
        dedupeKey: `edital-topics:${documentId}`,
      });
    }
    await notify(f.userId, notices);
    await syncStageItems(f.userId);
  }
  return { applied: Object.keys(values).length, followers: followers.length, dateChanges };
}

/** Student: start using the official exam date instead of the one they typed. */
export async function adoptOfficialExamDate(userId: string, competitionId: string) {
  const { count } = await db.studentCompetition.updateMany({ where: { userId, competitionId }, data: { keepCustomExamDate: false, customExamDate: null } });
  if (count === 0) throw new DomainError("Concurso não encontrado na sua lista.");
}

