import { PLAN_ITEM_KIND_LABEL } from "@/lib/labels";

type Kind = keyof typeof PLAN_ITEM_KIND_LABEL;

/** Human title of a plan item or session — shared by server and client. */
export function planItemTitle(item: { kind: Kind; topicName: string | null; subjectName: string | null }) {
  const topic = item.topicName;
  switch (item.kind) {
    case "NEW_CONTENT":
      return topic && item.subjectName ? `${item.subjectName} — ${topic}` : (topic ?? item.subjectName ?? "Teoria");
    case "QUESTIONS":
      return topic ? `Questões de ${topic}` : "Questões";
    case "REVIEW":
      return topic ? `Revisão de ${topic}` : "Revisão";
    default:
      return PLAN_ITEM_KIND_LABEL[item.kind];
  }
}
