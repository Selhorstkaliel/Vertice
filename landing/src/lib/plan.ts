import { studyRotation, type AvailabilityDay } from "@/data/demo";

export type PlanBlock = { start: string; end: string; subject: string; kind: string; minutes: number };

const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const toClock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export const slotMinutes = (day: AvailabilityDay) => (day.from && day.to ? toMinutes(day.to) - toMinutes(day.from) : 0);

/**
 * Ilustração simplificada de como horários livres viram blocos: 50 minutos de estudo e 10 de pausa,
 * e a última hora de cada dia fechando com 30 minutos de revisão. O motor real do app considera edital,
 * desempenho, energia e revisões — aqui só a forma do resultado importa.
 */
export function buildDemoPlan(days: AvailabilityDay[], enabled: Record<string, boolean>) {
  let cursor = 0;
  return days.map((day) => {
    if (!enabled[day.id] || !day.from || !day.to) return { day, blocks: [] as PlanBlock[] };

    const blocks: PlanBlock[] = [];
    let start = toMinutes(day.from);
    const end = toMinutes(day.to);

    while (end - start >= 30) {
      const remaining = end - start;
      const isReviewSlot = remaining <= 60 && blocks.length > 0;
      const minutes = isReviewSlot ? 30 : 50;
      const pick = studyRotation[cursor % studyRotation.length]!;
      blocks.push({
        start: toClock(start),
        end: toClock(start + minutes),
        subject: isReviewSlot ? "Revisão" : pick.subject,
        kind: isReviewSlot ? "Flashcards" : pick.kind,
        minutes,
      });
      if (!isReviewSlot) cursor += 1;
      start += minutes + 10;
    }
    return { day, blocks };
  });
}
