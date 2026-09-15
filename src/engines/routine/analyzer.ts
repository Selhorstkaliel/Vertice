import { formatClock, formatMinutes, weekdayName } from "@/lib/format";
import { checkGoalRealism } from "../adaptation/goal-realism";
import { clamp } from "@/lib/utils";
import { MANDATORY_CATEGORIES, weeklyWindows, DEFAULT_ENERGY, ENERGY_SCORE } from "./availability";
import type {
  Diagnostic,
  EnergyInput,
  OverloadRisk,
  RoutineBlockInput,
  StudyWindow,
  Sustainability,
  WeekHistory,
} from "../types";

export interface RoutineAnalysisInput {
  blocks: RoutineBlockInput[];
  energy?: EnergyInput[];
  weeklyTargetMinutes: number | null;
  dailyLimitMinutes: number;
  maxSessionMinutes: number;
  /** Most recent weeks first. Only weeks that had a plan. */
  history?: WeekHistory[];
  /** Minutes currently planned for the week, when a plan exists. */
  plannedMinutes?: number | null;
}

export interface RoutineAnalysis {
  windowsByDay: StudyWindow[][];
  capacityMinutes: number;
  capacityByDay: number[];
  classMinutes: { A: number; B: number; C: number };
  mandatoryByDay: number[];
  explicitStudyByDay: number[];
  targetMinutes: number | null;
  recommendedMinutes: number;
  recommendedBasis: string[];
  /** Load the sustainability check evaluated; `plannedBasis` says where it came from. */
  plannedMinutes: number;
  plannedBasis: "plan" | "target" | "recommended";
  consistency: number | null;
  sustainability: Sustainability;
  overloadRisk: OverloadRisk;
  diagnostics: Diagnostic[];
}

/** Total weekly load (obligations + study) considered sustainable. */
export const WEEKLY_LOAD_CEILING = 70 * 60;
export const DAILY_LOAD_CEILING = 13 * 60;

const roundTo30 = (m: number) => Math.max(0, Math.round(m / 30) * 30);

function overlap(a: { startMinute: number; endMinute: number }, start: number, end: number) {
  return Math.max(0, Math.min(a.endMinute, end) - Math.max(a.startMinute, start));
}

export function analyzeRoutine(input: RoutineAnalysisInput): RoutineAnalysis {
  const energy = input.energy?.length ? input.energy : DEFAULT_ENERGY;
  const { blocks } = input;
  const windowsByDay = weeklyWindows(blocks, energy);
  const diagnostics: Diagnostic[] = [];

  const capacityByDay = windowsByDay.map((ws) => ws.reduce((a, w) => a + (w.end - w.start), 0));
  const capacityMinutes = capacityByDay.reduce((a, b) => a + b, 0);
  const classMinutes = { A: 0, B: 0, C: 0 };
  for (const ws of windowsByDay) for (const w of ws) classMinutes[w.slotClass] += w.end - w.start;

  const mandatoryByDay = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    blocks
      .filter((b) => b.dayOfWeek === d && MANDATORY_CATEGORIES.has(b.category))
      .reduce((a, b) => a + (b.endMinute - b.startMinute), 0),
  );
  const explicitStudyByDay = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    blocks
      .filter((b) => b.dayOfWeek === d && b.category === "STUDY")
      .reduce((a, b) => a + (b.endMinute - b.startMinute), 0),
  );
  const weeklyMandatory = mandatoryByDay.reduce((a, b) => a + b, 0);

  /* ── recommended load ─────────────────────────────────────────────── */
  const basis: string[] = [];
  const realisticCapacity = roundTo30(capacityMinutes * 0.75);
  const loadRoom = roundTo30(Math.max(0, WEEKLY_LOAD_CEILING - weeklyMandatory));
  let recommended = Math.min(realisticCapacity, input.dailyLimitMinutes * 7, loadRoom);
  basis.push(`75% do tempo livre na rotina (${formatMinutes(realisticCapacity)})`);
  if (loadRoom < realisticCapacity) {
    basis.push(`carga total semanal limitada a ${formatMinutes(WEEKLY_LOAD_CEILING)} incluindo obrigações`);
  }
  if (input.weeklyTargetMinutes && input.weeklyTargetMinutes < recommended) {
    recommended = input.weeklyTargetMinutes;
    basis.push("sua meta semanal");
  }

  const history = (input.history ?? []).slice(0, 4);
  const executedWeeks = history.filter((h) => h.plannedMinutes > 0);
  let consistency: number | null = null;
  if (executedWeeks.length >= 1) {
    consistency =
      executedWeeks.reduce((a, h) => a + Math.min(1, h.executedMinutes / h.plannedMinutes), 0) /
      executedWeeks.length;
  }

  const realism = checkGoalRealism(input.weeklyTargetMinutes, executedWeeks);
  if (realism) {
    recommended = Math.min(recommended, realism.suggestedMinutes);
    basis.push(`execução média de ${formatMinutes(realism.averageMinutes)} nas últimas três semanas`);
    diagnostics.push({
      code: "UNREALISTIC_TARGET",
      severity: "warning",
      title: "Meta acima da execução real",
      detail: `Nas últimas três semanas sua execução média foi de ${formatMinutes(realism.averageMinutes)}. Sua meta atual é ${formatMinutes(realism.targetMinutes)}.`,
      suggestion: `Reduza temporariamente a meta para aproximadamente ${formatMinutes(realism.suggestedMinutes)} e aumente de forma gradual.`,
    });
  }
  recommended = roundTo30(recommended);

  /* ── routine diagnostics ──────────────────────────────────────────── */

  // Heavy study right after a long day of obligations.
  const bestTransferDay = (() => {
    let best: { day: number; window: StudyWindow } | null = null;
    for (const ws of windowsByDay) {
      for (const w of ws) {
        if (w.slotClass !== "A" && w.slotClass !== "B") continue;
        if (w.end - w.start < 90) continue;
        const scoreW = w.energyScore + (w.dayOfWeek >= 6 ? 0.5 : 0);
        if (!best || scoreW > best.window.energyScore) best = { day: w.dayOfWeek, window: w };
      }
    }
    return best;
  })();

  for (const b of blocks) {
    if (b.category !== "STUDY") continue;
    const length = b.endMinute - b.startMinute;
    const before = blocks
      .filter((o) => o.dayOfWeek === b.dayOfWeek && MANDATORY_CATEGORIES.has(o.category))
      .reduce((a, o) => a + overlap(o, 0, b.startMinute), 0);

    if (length >= 180 && before >= 480) {
      const reduced = Math.max(90, roundTo30(length * 0.6));
      const moved = length - reduced;
      const transfer =
        bestTransferDay && bestTransferDay.day !== b.dayOfWeek
          ? ` e transfira ${formatMinutes(moved)} para ${weekdayName(bestTransferDay.day).toLowerCase()} às ${formatClock(bestTransferDay.window.start)}`
          : "";
      diagnostics.push({
        code: "STUDY_AFTER_OBLIGATIONS",
        severity: before >= 540 ? "critical" : "warning",
        dayOfWeek: b.dayOfWeek,
        title: "Baixa sustentabilidade",
        detail: `Você programou ${formatMinutes(length)} de estudo após ${formatMinutes(before)} de atividades obrigatórias (${weekdayName(b.dayOfWeek).toLowerCase()}).`,
        suggestion: `Reduza esse bloco para ${formatMinutes(reduced)}${transfer}.`,
      });
    } else if (length > Math.max(180, input.maxSessionMinutes * 2)) {
      diagnostics.push({
        code: "LONG_SESSION",
        severity: "info",
        dayOfWeek: b.dayOfWeek,
        title: "Bloco de estudo longo",
        detail: `${weekdayName(b.dayOfWeek)}, ${formatClock(b.startMinute)}–${formatClock(b.endMinute)}: ${formatMinutes(length)} contínuos.`,
        suggestion: `O plano divide esse bloco em sessões de até ${formatMinutes(input.maxSessionMinutes)} com pausas.`,
      });
    }

    const periodEnergy = energy.find((e) => {
      const mid = (b.startMinute + b.endMinute) / 2;
      return (
        (e.period === "DAWN" && mid < 360) ||
        (e.period === "MORNING" && mid >= 360 && mid < 720) ||
        (e.period === "AFTERNOON" && mid >= 720 && mid < 1080) ||
        (e.period === "EVENING" && mid >= 1080)
      );
    });
    const levelScore = b.energy ? ENERGY_SCORE[b.energy] : ENERGY_SCORE[periodEnergy?.level ?? "NORMAL"];
    if (length >= 60 && levelScore <= -1) {
      diagnostics.push({
        code: "ENERGY_MISMATCH",
        severity: "info",
        dayOfWeek: b.dayOfWeek,
        title: "Estudo em período de energia baixa",
        detail: `${weekdayName(b.dayOfWeek)}, ${formatClock(b.startMinute)}–${formatClock(b.endMinute)} está marcado com energia baixa.`,
        suggestion: "O plano usará esse horário para flashcards, caderno de erros e revisão leve.",
      });
    }
  }

  // Daily overload
  for (let d = 0; d < 7; d++) {
    const total = (mandatoryByDay[d] ?? 0) + (explicitStudyByDay[d] ?? 0);
    if (total > DAILY_LOAD_CEILING) {
      diagnostics.push({
        code: "DAILY_OVERLOAD",
        severity: "critical",
        dayOfWeek: d + 1,
        title: "Dia sobrecarregado",
        detail: `${weekdayName(d + 1)}: atividades obrigatórias e estudo somam ${formatMinutes(total)}.`,
        suggestion: "Mova parte do estudo desse dia para um dia com menos obrigações.",
      });
    }
  }

  // Rest
  const studyDays = explicitStudyByDay.filter((m) => m >= 60).length;
  if (studyDays === 7) {
    diagnostics.push({
      code: "NO_REST_DAY",
      severity: "warning",
      title: "Nenhum dia com carga reduzida",
      detail: "Há pelo menos 1h de estudo programada em todos os dias da semana.",
      suggestion: "Reserve um dia com no máximo 1h, só para revisão leve.",
    });
  }

  // Sleep as registered (never a medical assessment)
  const sleepBlocks = blocks.filter((b) => b.category === "SLEEP");
  if (sleepBlocks.length === 0 && blocks.length > 0) {
    diagnostics.push({
      code: "SLEEP_NOT_REGISTERED",
      severity: "info",
      title: "Sono não registrado",
      detail: "Sem blocos de sono, o plano considera disponível qualquer horário livre entre 06:00 e 23:30.",
      suggestion: "Registre seu horário de sono para que o plano nunca ocupe esse período.",
    });
  } else {
    for (let d = 1; d <= 7; d++) {
      const next = d === 7 ? 1 : d + 1;
      const night =
        sleepBlocks.filter((b) => b.dayOfWeek === d && b.startMinute >= 18 * 60).reduce((a, b) => a + b.endMinute - b.startMinute, 0) +
        sleepBlocks.filter((b) => b.dayOfWeek === next && b.endMinute <= 12 * 60).reduce((a, b) => a + b.endMinute - b.startMinute, 0);
      if (night > 0 && night < 360) {
        diagnostics.push({
          code: "SHORT_SLEEP_WINDOW",
          severity: "warning",
          dayOfWeek: d,
          title: "Período de descanso curto",
          detail: `A rotina registra ${formatMinutes(night)} de sono na noite de ${weekdayName(d).toLowerCase()}.`,
          suggestion: "Proteja esse horário de descanso e evite blocos de estudo no fim desse dia.",
        });
      }
    }
  }

  if (blocks.length > 0 && !blocks.some((b) => b.category === "MEAL")) {
    diagnostics.push({
      code: "MEALS_NOT_REGISTERED",
      severity: "info",
      title: "Refeições não registradas",
      detail: "Sem blocos de alimentação, horários de almoço e jantar podem receber sessões de estudo.",
      suggestion: "Adicione blocos de Alimentação para protegê-los.",
    });
  }

  // Target vs capacity
  if (input.weeklyTargetMinutes && input.weeklyTargetMinutes > capacityMinutes * 0.85) {
    diagnostics.push({
      code: "TARGET_EXCEEDS_CAPACITY",
      severity: "critical",
      title: "Meta maior que o tempo disponível",
      detail: `Sua meta de ${formatMinutes(input.weeklyTargetMinutes)} excede o tempo livre realista da rotina (${formatMinutes(realisticCapacity)}).`,
      suggestion: `Ajuste a meta para cerca de ${formatMinutes(recommended)} ou libere horários na rotina.`,
    });
  }

  // Wasted high-energy windows
  if (input.weeklyTargetMinutes) {
    const explicitTotal = explicitStudyByDay.reduce((a, b) => a + b, 0);
    if (explicitTotal < input.weeklyTargetMinutes) {
      const unused = windowsByDay
        .flat()
        .filter((w) => !w.explicit && w.slotClass === "A" && w.end - w.start >= 90)
        .sort((a, b) => b.end - b.start - (a.end - a.start));
      const first = unused[0];
      if (first) {
        diagnostics.push({
          code: "WASTED_WINDOWS",
          severity: "info",
          dayOfWeek: first.dayOfWeek,
          title: "Janelas de alta energia sem uso",
          detail: `${unused.length === 1 ? "Há 1 janela" : `Há ${unused.length} janelas`} de alta energia livres, como ${weekdayName(first.dayOfWeek).toLowerCase()} ${formatClock(first.start)}–${formatClock(first.end)}.`,
          suggestion: "Reserve essas janelas para conteúdo novo e disciplinas mais exigentes.",
        });
      }
    }
  }

  // Irregular availability
  const activeDays = capacityByDay.filter((c) => c >= 30);
  if (activeDays.length >= 2) {
    const mean = activeDays.reduce((a, b) => a + b, 0) / activeDays.length;
    const sd = Math.sqrt(activeDays.reduce((a, b) => a + (b - mean) ** 2, 0) / activeDays.length);
    if (mean > 0 && sd / mean > 0.75) {
      diagnostics.push({
        code: "IRREGULAR_ROUTINE",
        severity: "info",
        title: "Disponibilidade irregular",
        detail: "O tempo livre varia muito entre os dias da semana.",
        suggestion: "Blocos curtos e fixos em dias cheios ajudam a manter o ritmo sem sobrecarregar os dias livres.",
      });
    }
  }

  /* ── sustainability & risk ────────────────────────────────────────── */
  const planned = input.plannedMinutes ?? input.weeklyTargetMinutes ?? recommended;
  const plannedBasis = input.plannedMinutes != null ? "plan" : input.weeklyTargetMinutes != null ? "target" : "recommended";
  const ratio = recommended > 0 ? planned / recommended : planned > 0 ? 2 : 1;
  const overloadedDays = diagnostics.filter((d) => d.code === "DAILY_OVERLOAD").length;
  const noRest = diagnostics.some((d) => d.code === "NO_REST_DAY");

  let score = 100;
  for (const d of diagnostics) {
    if (d.severity === "critical") score -= 25;
    else if (d.severity === "warning") score -= 10;
  }
  if (ratio > 1.3) score -= 35;
  else if (ratio > 1.15) score -= 20;
  if (weeklyMandatory + planned > WEEKLY_LOAD_CEILING) score -= 20;
  score = clamp(score, 0, 100);

  const sustainability: Sustainability = score >= 75 ? "GOOD" : score >= 50 ? "MODERATE" : "LOW";
  const overloadRisk: OverloadRisk =
    ratio > 1.3 || overloadedDays >= 2 ? "HIGH" : ratio > 1.1 || overloadedDays === 1 || noRest ? "MODERATE" : "LOW";

  const severityRank = { critical: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    windowsByDay,
    capacityMinutes,
    capacityByDay,
    classMinutes,
    mandatoryByDay,
    explicitStudyByDay,
    targetMinutes: input.weeklyTargetMinutes,
    recommendedMinutes: recommended,
    recommendedBasis: basis,
    plannedMinutes: planned,
    plannedBasis,
    consistency,
    sustainability,
    overloadRisk,
    diagnostics,
  };
}

export const SUSTAINABILITY_LABEL: Record<Sustainability, string> = {
  GOOD: "Boa",
  MODERATE: "Moderada",
  LOW: "Baixa",
};

export const OVERLOAD_LABEL: Record<OverloadRisk, string> = {
  LOW: "Baixo",
  MODERATE: "Moderado",
  HIGH: "Alto",
};
