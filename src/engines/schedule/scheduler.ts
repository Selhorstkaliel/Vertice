import { formatMinutes } from "@/lib/format";
import type { DateKey } from "@/lib/time";
import { clamp } from "@/lib/utils";
import type { Diagnostic, PlanItemKind, SlotClass, StudyWindow } from "../types";
import type { ScoredTopic } from "../study/priority";

/**
 * Schedule Engine — decides WHEN to study.
 *
 * Fills the user's classified study windows with sessions chosen from the
 * Study Engine ranking, respecting: daily limit, max session length, breaks,
 * slot energy class, subject balance (no subject above 40% of the week, and a
 * boost for subjects not yet seen), and pairing theory → questions.
 */

export const ENGINE_VERSION = "schedule-1.0";

export interface ScheduleDay {
  key: DateKey;
  isoWeekday: number;
  /** Free windows (future only, occupied time already removed). */
  windows: StudyWindow[];
  /** Minutes already committed that day by items that are kept. */
  existingMinutes: number;
  hasFlashcards: boolean;
}

export interface ScheduleInput {
  days: ScheduleDay[];
  budgetMinutes: number;
  dailyLimitMinutes: number;
  maxSessionMinutes: number;
  minBreakMinutes: number;
  topics: ScoredTopic[];
  flashcards: { total: number; dueNow: number };
  unresolvedErrors: number;
  /** Minutes per subject already committed this week by kept items. */
  subjectMinutes?: Record<string, number>;
}

export interface ReasonData {
  slotClass: SlotClass;
  energyScore: number;
  topicStatus?: string;
  accuracy?: number | null;
  factors?: ScoredTopic["factors"];
  reasons: { code: string; text: string }[];
  competitionIds?: string[];
}

export interface ScheduledItem {
  dateKey: DateKey;
  startMinute: number;
  endMinute: number;
  kind: PlanItemKind;
  slotClass: SlotClass;
  topicId: string | null;
  subjectId: string | null;
  competitionId: string | null;
  priorityScore: number;
  reason: string;
  reasonData: ReasonData;
}

export interface ScheduleResult {
  items: ScheduledItem[];
  plannedMinutes: number;
  unplacedMinutes: number;
  diagnostics: Diagnostic[];
}

const LENGTH: Record<PlanItemKind, { ideal: number; min: number }> = {
  NEW_CONTENT: { ideal: 50, min: 30 },
  QUESTIONS: { ideal: 40, min: 25 },
  REVIEW: { ideal: 25, min: 15 },
  FLASHCARDS: { ideal: 20, min: 10 },
  ERROR_NOTEBOOK: { ideal: 20, min: 15 },
  SIMULATION: { ideal: 120, min: 60 },
  WRITING: { ideal: 60, min: 45 },
};

export const SUBJECT_WEEKLY_CAP = 0.4;

/** Splits the budget across days ∝ √capacity (smooths weekend-heavy routines), capped per day. */
export function allocateDailyBudgets(capacities: number[], budget: number): number[] {
  const alloc = capacities.map(() => 0);
  let remaining = Math.min(budget, capacities.reduce((a, b) => a + b, 0));
  let active = capacities.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  while (remaining > 1 && active.length) {
    const weights = active.map((i) => Math.sqrt(capacities[i]! - alloc[i]!));
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (totalW <= 0) break;
    let spent = 0;
    active.forEach((i, idx) => {
      const room = capacities[i]! - alloc[i]!;
      const share = Math.min(room, (remaining * weights[idx]!) / totalW);
      alloc[i]! += share;
      spent += share;
    });
    remaining -= spent;
    active = active.filter((i) => capacities[i]! - alloc[i]! > 1);
    if (spent < 1) break;
  }
  return alloc.map((a) => Math.floor(a));
}

interface Free {
  start: number;
  end: number;
  slotClass: SlotClass;
  energyScore: number;
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const items: ScheduledItem[] = [];
  const subjectMinutes: Record<string, number> = { ...(input.subjectMinutes ?? {}) };
  const topicPicks = new Map<string, number>();
  const subjectCount = new Set(input.topics.map((t) => t.subjectId)).size || 1;
  const fairShare = input.budgetMinutes / subjectCount;
  // Never below one theory session plus its follow-up questions, or small budgets block every subject.
  const subjectCap = subjectCount >= 3 ? Math.max(input.budgetMinutes * SUBJECT_WEEKLY_CAP, LENGTH.NEW_CONTENT.ideal + LENGTH.QUESTIONS.ideal) : Infinity;
  let errorNotebookPlaced = false;

  const maxSession = Math.max(25, input.maxSessionMinutes);
  const lengthFor = (kind: PlanItemKind) => ({
    ideal: Math.min(LENGTH[kind].ideal, maxSession),
    min: Math.min(LENGTH[kind].min, maxSession),
  });

  /* ── budgets per day ────────────────────────────────────────────── */
  const capacities = input.days.map((d) =>
    Math.max(
      0,
      Math.min(
        d.windows.reduce((a, w) => a + (w.end - w.start), 0),
        input.dailyLimitMinutes - d.existingMinutes,
      ),
    ),
  );
  // A full week keeps one lighter day to protect rest.
  if (input.days.length === 7 && capacities.every((c) => c >= 60)) {
    let lightest = 0;
    capacities.forEach((c, i) => {
      if (c < capacities[lightest]! || (c === capacities[lightest] && input.days[i]!.isoWeekday === 7)) lightest = i;
    });
    capacities[lightest] = Math.min(capacities[lightest]!, 45);
  }
  const budgets = allocateDailyBudgets(capacities, input.budgetMinutes);

  /* ── topic selection ────────────────────────────────────────────── */
  function effectiveScore(t: ScoredTopic, lastSubjectId: string | null, len: number) {
    const used = subjectMinutes[t.subjectId] ?? 0;
    if (used + len > subjectCap) return 0;
    const damp = 0.45 ** (topicPicks.get(t.topicId) ?? 0);
    const balance = clamp(1.35 - (0.9 * used) / Math.max(1, fairShare), 0.3, 1.35);
    const sameSubject = lastSubjectId === t.subjectId ? 0.5 : 1;
    return t.score * damp * balance * sameSubject;
  }

  function best(filter: (t: ScoredTopic) => boolean, lastSubjectId: string | null, len: number, bias?: (t: ScoredTopic) => number) {
    let chosen: ScoredTopic | null = null;
    let chosenScore = 0;
    for (const t of input.topics) {
      if (!filter(t)) continue;
      const s = effectiveScore(t, lastSubjectId, len) * (bias ? bias(t) : 1);
      if (s > chosenScore) {
        chosen = t;
        chosenScore = s;
      }
    }
    return chosen;
  }

  function topicItem(
    day: ScheduleDay,
    free: Free,
    start: number,
    len: number,
    kind: PlanItemKind,
    topic: ScoredTopic,
    extraReasons: { code: string; text: string }[] = [],
  ): ScheduledItem {
    const used = subjectMinutes[topic.subjectId] ?? 0;
    const reasons = [...extraReasons];
    if (used === 0 && subjectCount > 1 && kind !== "QUESTIONS") {
      reasons.push({ code: "BALANCE", text: `Equilíbrio: primeira sessão de ${topic.subjectName} nesta semana.` });
    }
    reasons.push(...topic.reasons.slice(0, 4).map(({ code, text }) => ({ code, text })));
    subjectMinutes[topic.subjectId] = used + len;
    topicPicks.set(topic.topicId, (topicPicks.get(topic.topicId) ?? 0) + 1);
    const primary = topic.competitions.find((c) => c.isPrimary) ?? topic.competitions[0];
    return {
      dateKey: day.key,
      startMinute: start,
      endMinute: start + len,
      kind,
      slotClass: free.slotClass,
      topicId: topic.topicId,
      subjectId: topic.subjectId,
      competitionId: primary?.competitionId ?? null,
      priorityScore: topic.score,
      reason: extraReasons[0] ? `${extraReasons[0].text} ${topic.summary}` : topic.summary,
      reasonData: {
        slotClass: free.slotClass,
        energyScore: free.energyScore,
        topicStatus: topic.progress?.status ?? "NOT_STUDIED",
        accuracy: topic.accuracy,
        factors: topic.factors,
        reasons,
        competitionIds: topic.competitions.map((c) => c.competitionId),
      },
    };
  }

  function genericItem(day: ScheduleDay, free: Free, start: number, len: number, kind: PlanItemKind, reason: string, code: string): ScheduledItem {
    return {
      dateKey: day.key,
      startMinute: start,
      endMinute: start + len,
      kind,
      slotClass: free.slotClass,
      topicId: null,
      subjectId: null,
      competitionId: null,
      priorityScore: 0,
      reason,
      reasonData: { slotClass: free.slotClass, energyScore: free.energyScore, reasons: [{ code, text: reason }] },
    };
  }

  const flashcardReason = () =>
    input.flashcards.dueNow > 0
      ? `${input.flashcards.dueNow} ${input.flashcards.dueNow === 1 ? "flashcard pendente" : "flashcards pendentes"} de revisão.`
      : "Revisão diária de flashcards para consolidar a memória de longo prazo.";

  /* ── day by day ─────────────────────────────────────────────────── */
  let plannedMinutes = 0;
  const CLASS_RANK: Record<SlotClass, number> = { A: 3, B: 2, C: 1 };
  // Best windows are filled first: energy class, explicit study blocks, then length.
  const windowRank = (w: StudyWindow) => CLASS_RANK[w.slotClass] + (w.explicit ? 0.5 : 0) + Math.min(w.end - w.start, 120) / 240;
  const followUpReason = (t: ScoredTopic) => ({ code: "FOLLOW_UP", text: `Fixação: questões de ${t.topicName} depois da teoria.` });
  // Questions that follow a theory session never start before that session ends.
  let followUp: { topic: ScoredTopic; dateKey: DateKey; notBefore: number } | null = null;

  input.days.forEach((day, dayIndex) => {
    const budget = budgets[dayIndex] ?? 0;
    if (budget < 10) return;
    let placed = 0;
    let lastSubjectId: string | null = null;
    let demandingToday = 0;
    let flashcardsPlaced = day.hasFlashcards;
    const wantFlashcards = input.flashcards.total > 0;
    const reserveFlash = wantFlashcards && !flashcardsPlaced ? lengthFor("FLASHCARDS").ideal : 0;
    const leftovers: Free[] = [];

    const ordered = [...day.windows].sort((a, b) => windowRank(b) - windowRank(a) || a.start - b.start);
    for (const w of ordered) {
      let t = w.start;
      while (t < w.end) {
        const room = w.end - t;
        const budgetLeft = budget - placed - (flashcardsPlaced ? 0 : reserveFlash);
        const avail = Math.min(room, Math.max(0, budgetLeft));
        const free: Free = { start: t, end: w.end, slotClass: room < 25 ? "C" : w.slotClass, energyScore: w.energyScore };
        const cls = free.slotClass;
        const fits = (kind: PlanItemKind) => avail >= lengthFor(kind).min;
        const lenOf = (kind: PlanItemKind) => Math.min(lengthFor(kind).ideal, avail);
        const followUpReady = !!followUp && (followUp.dateKey !== day.key || t >= followUp.notBefore);
        let item: ScheduledItem | null = null;

        const placeFlashcards = () => {
          flashcardsPlaced = true;
          const len = Math.min(lengthFor("FLASHCARDS").ideal, room, budget - placed);
          return genericItem(day, free, t, len, "FLASHCARDS", flashcardReason(), "FLASHCARDS_DUE");
        };
        const placeFollowUp = () => {
          const topic = followUp!.topic;
          followUp = null;
          return topicItem(day, free, t, lenOf("QUESTIONS"), "QUESTIONS", topic, [followUpReason(topic)]);
        };

        if (avail < 10) {
          // Day budget spent; only the reserved flashcard block may still go here.
          if (wantFlashcards && !flashcardsPlaced && room >= lengthFor("FLASHCARDS").min && budget - placed >= lengthFor("FLASHCARDS").min) {
            item = placeFlashcards();
          } else {
            leftovers.push(free);
            break;
          }
        } else if (cls === "A" || cls === "B") {
          // After two demanding theory sessions in a day, alternate with practice.
          const practiceMode = cls === "B" || demandingToday >= 2;
          if (practiceMode && followUpReady && fits("QUESTIONS")) item = placeFollowUp();
          if (!item && !practiceMode && fits("NEW_CONTENT")) {
            const len = lenOf("NEW_CONTENT");
            const topic = best((x) => x.suggestedKind === "NEW_CONTENT", lastSubjectId, len, (x) => (x.demanding ? 1.15 : 1));
            if (topic) {
              item = topicItem(day, free, t, len, "NEW_CONTENT", topic, topic.demanding ? [{ code: "SLOT_A", text: "Horário de alta performance reservado para conteúdo exigente." }] : []);
            }
          }
          if (!item) {
            const topic = best(() => true, lastSubjectId, lenOf("QUESTIONS"), (x) => (practiceMode && x.demanding ? 0.7 : 1));
            if (topic) {
              if (fits(topic.suggestedKind)) item = topicItem(day, free, t, lenOf(topic.suggestedKind), topic.suggestedKind, topic);
              else if (topic.suggestedKind !== "NEW_CONTENT" && fits("REVIEW")) item = topicItem(day, free, t, lenOf("REVIEW"), "REVIEW", topic);
            }
          }
          if (!item && followUpReady && fits("QUESTIONS")) item = placeFollowUp();
        } else {
          if (wantFlashcards && !flashcardsPlaced && room >= lengthFor("FLASHCARDS").min) item = placeFlashcards();
          if (!item && fits("REVIEW")) {
            const topic = best((x) => x.suggestedKind === "REVIEW" || x.factors.reviewNeed > 1, lastSubjectId, lenOf("REVIEW"));
            if (topic) item = topicItem(day, free, t, lenOf("REVIEW"), "REVIEW", topic);
          }
          if (!item && input.unresolvedErrors >= 3 && !errorNotebookPlaced && fits("ERROR_NOTEBOOK")) {
            errorNotebookPlaced = true;
            item = genericItem(day, free, t, lenOf("ERROR_NOTEBOOK"), "ERROR_NOTEBOOK", `${input.unresolvedErrors} erros no Caderno de Erros ainda sem revisão.`, "UNRESOLVED_ERRORS");
          }
          if (!item && followUpReady && fits("QUESTIONS")) item = placeFollowUp();
          if (!item && fits("QUESTIONS")) {
            const topic = best((x) => !x.demanding && x.suggestedKind !== "NEW_CONTENT", lastSubjectId, lenOf("QUESTIONS"));
            if (topic) item = topicItem(day, free, t, lenOf("QUESTIONS"), "QUESTIONS", topic);
          }
          // Nothing light to do yet (common for new students): lighter theory, then any theory, disclosed.
          if (!item && fits("NEW_CONTENT")) {
            const len = lenOf("NEW_CONTENT");
            const light = best((x) => x.suggestedKind === "NEW_CONTENT" && !x.demanding, lastSubjectId, len);
            if (light) {
              item = topicItem(day, free, t, len, "NEW_CONTENT", light, [{ code: "LOW_ENERGY_LIGHT", text: "Horário de baixa exigência: conteúdo de menor carga." }]);
            } else {
              const any = best((x) => x.suggestedKind === "NEW_CONTENT", lastSubjectId, len);
              if (any) {
                item = topicItem(day, free, t, len, "NEW_CONTENT", any, [
                  { code: "LOW_ENERGY_ONLY", text: "Horário de energia mais baixa; se possível, troque por um horário de maior energia." },
                ]);
              }
            }
          }
        }

        if (!item) {
          leftovers.push(free);
          break;
        }

        items.push(item);
        placed += item.endMinute - item.startMinute;
        lastSubjectId = item.subjectId ?? lastSubjectId;
        if (item.kind === "NEW_CONTENT" && item.topicId) {
          const topic = input.topics.find((x) => x.topicId === item!.topicId);
          if (topic) {
            followUp = { topic, dateKey: day.key, notBefore: item.endMinute + input.minBreakMinutes };
            if (topic.demanding) demandingToday++;
          }
        }
        t = item.endMinute + input.minBreakMinutes;
      }
    }

    // Flashcards not placed yet: use the latest leftover gap of the day.
    if (wantFlashcards && !flashcardsPlaced) {
      const gap = [...leftovers].sort((a, b) => b.end - a.end).find((g) => g.end - g.start >= lengthFor("FLASHCARDS").min);
      if (gap) {
        const len = Math.min(lengthFor("FLASHCARDS").ideal, gap.end - gap.start);
        items.push(genericItem(day, gap, gap.end - len, len, "FLASHCARDS", flashcardReason(), "FLASHCARDS_DUE"));
        placed += len;
      }
    }

    plannedMinutes += placed;
  });

  items.sort((a, b) => (a.dateKey === b.dateKey ? a.startMinute - b.startMinute : a.dateKey < b.dateKey ? -1 : 1));
  const unplacedMinutes = Math.max(0, input.budgetMinutes - plannedMinutes);

  return { items, plannedMinutes, unplacedMinutes, diagnostics: analyzePlan(items, input, unplacedMinutes) };
}

/** Plan-level checks, complementary to the routine analyzer. */
export function analyzePlan(items: ScheduledItem[], input: Pick<ScheduleInput, "budgetMinutes" | "topics">, unplacedMinutes: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const total = items.reduce((a, i) => a + i.endMinute - i.startMinute, 0);
  const light = items
    .filter((i) => i.kind === "REVIEW" || i.kind === "FLASHCARDS" || i.kind === "ERROR_NOTEBOOK")
    .reduce((a, i) => a + i.endMinute - i.startMinute, 0);

  if (total >= 300 && light / total < 0.12) {
    diagnostics.push({
      code: "LITTLE_REVIEW",
      severity: "info",
      title: "Pouco espaço para revisão",
      detail: `Revisões e flashcards ocupam ${Math.round((light / total) * 100)}% do plano.`,
      suggestion: "Adicione um horário curto de baixa energia na rotina — é onde entram as revisões leves.",
    });
  }

  const demandingIds = new Set(input.topics.filter((t) => t.demanding).map((t) => t.topicId));
  const byDay = new Map<string, number>();
  for (const i of items) {
    if (i.kind === "NEW_CONTENT" && i.topicId && demandingIds.has(i.topicId)) {
      byDay.set(i.dateKey, (byDay.get(i.dateKey) ?? 0) + 1);
    }
  }
  for (const [day, count] of byDay) {
    if (count >= 3) {
      diagnostics.push({
        code: "HARD_CONCENTRATION",
        severity: "warning",
        title: "Conteúdo exigente concentrado",
        detail: `${count} sessões de conteúdo novo exigente no mesmo dia (${day.split("-").reverse().slice(0, 2).join("/")}).`,
        suggestion: "Distribua parte dessas sessões em outros dias ou alterne com questões.",
      });
    }
  }

  if (unplacedMinutes >= 60) {
    diagnostics.push({
      code: "UNPLACED",
      severity: "info",
      title: "Volume recomendado não coube",
      detail: `Faltaram ${formatMinutes(unplacedMinutes)} para atingir a carga planejada com os horários livres desta semana.`,
      suggestion: "Libere horários na rotina ou reduza a meta semanal.",
    });
  }

  if (input.topics.length === 0) {
    diagnostics.push({
      code: "NO_TOPICS",
      severity: "warning",
      title: "Edital sem conteúdos",
      detail: "Nenhum tópico do edital está disponível para planejar.",
      suggestion: "Adicione disciplinas e tópicos ao seu concurso principal.",
    });
  }
  return diagnostics;
}
