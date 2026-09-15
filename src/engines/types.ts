/**
 * Engine contracts. Engines are pure: they receive plain data and return
 * plain data. No database, no clock (callers pass `today`/`now`).
 */

import type { DateKey, DayPeriodName } from "@/lib/time";

export type EnergyLevel = "VERY_HIGH" | "HIGH" | "NORMAL" | "LOW" | "VERY_LOW";
export type SlotClass = "A" | "B" | "C";
export type TopicStatus = "NOT_STUDIED" | "IN_PROGRESS" | "STUDIED" | "REVIEWED";

export type RoutineCategory =
  | "SLEEP"
  | "WORK"
  | "COLLEGE"
  | "SCHOOL"
  | "COURSE"
  | "COMMUTE"
  | "TRAINING"
  | "STUDY"
  | "MEAL"
  | "FAMILY"
  | "LEISURE"
  | "APPOINTMENT"
  | "FREE"
  | "OTHER";

export type PlanItemKind =
  | "NEW_CONTENT"
  | "QUESTIONS"
  | "REVIEW"
  | "FLASHCARDS"
  | "ERROR_NOTEBOOK"
  | "SIMULATION"
  | "WRITING";

export interface RoutineBlockInput {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  category: RoutineCategory;
  isFixed: boolean;
  energy: EnergyLevel | null;
  label?: string | null;
}

export interface EnergyInput {
  period: DayPeriodName;
  level: EnergyLevel;
  learnedDelta: number;
}

export interface StudyWindow {
  dayOfWeek: number;
  start: number;
  end: number;
  slotClass: SlotClass;
  energyScore: number;
  /** True when the time comes from an explicit Estudo/Livre block. */
  explicit: boolean;
  /** Minutes of mandatory activity earlier the same day. */
  mandatoryBefore: number;
}

export interface Explanation {
  code: string;
  text: string;
  /** Relative contribution, used to pick the most relevant reasons. */
  weight: number;
}

export type Severity = "info" | "warning" | "critical";

export interface Diagnostic {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  suggestion?: string;
  dayOfWeek?: number;
}

export type Sustainability = "GOOD" | "MODERATE" | "LOW";
export type OverloadRisk = "LOW" | "MODERATE" | "HIGH";

export interface WeekHistory {
  weekStart: DateKey;
  plannedMinutes: number;
  executedMinutes: number;
}
