import { clamp } from "@/lib/utils";

/**
 * "O que mais cai" — turns counts of official questions into a 0..1
 * incidence per edital topic, the `incidence` factor of the Study Engine.
 *
 * Formula, per leaf topic t of a competition:
 *
 *   share(t)  = questions(t) / totalQuestions            (official questions only)
 *   ratio(t)  = share(t) / (1 / N)                        N = edital leaf topics
 *   raw(t)    = ratio / (ratio + 1)                       0 = never asked, 0.5 = average topic
 *   conf(t)   = min(1, subjectPapers(t) / fullConfidencePapers)
 *   incidence = NEUTRAL + conf × (raw − NEUTRAL)          NEUTRAL = 0.5
 *
 * - `subjectPapers` counts the papers that asked anything of the topic's
 *   subject: a 2-day exam splits subjects between papers, and a topic cannot
 *   "fail to appear" in a paper that never covers its subject.
 * - With few papers the value is pulled toward the average (0.5), so a topic
 *   that fell once in a single paper is not overvalued.
 * - 0.5 maps to a neutral priority factor (0.7 + 0.6 × 0.5 = 1), so an
 *   average topic keeps exactly the priority it had before incidence existed.
 * - No papers for the subject → null (unknown), never 0.
 */

export const NEUTRAL_INCIDENCE = 0.5;
/** Papers covering the subject needed before incidence is fully trusted (hypothesis, adjustable). */
export const FULL_CONFIDENCE_PAPERS = 3;

export interface TopicQuestionCount {
  topicId: string;
  subjectId: string;
  /** Official questions tagged with this topic. */
  questions: number;
  /** Distinct papers in which the topic appeared. */
  papers: number;
}

export interface IncidenceInput {
  /** Every edital leaf topic, including the ones with zero questions. */
  topics: TopicQuestionCount[];
  /** All official questions of the competition (tagged or not). */
  totalQuestions: number;
  /** Papers that asked at least one question of each subject. */
  subjectPapers: Map<string, number>;
  fullConfidencePapers?: number;
}

export interface TopicIncidence {
  topicId: string;
  questions: number;
  papers: number;
  /** Papers that covered the topic's subject (the "Z" in "Y de Z provas"). */
  subjectPapers: number;
  /** questions / totalQuestions. */
  share: number;
  /** 0..1, or null when there is no evidence for the subject. */
  incidence: number | null;
  /** 0..1 — how much the value is trusted over the neutral average. */
  confidence: number;
}

export function computeIncidence(input: IncidenceInput): Map<string, TopicIncidence> {
  const out = new Map<string, TopicIncidence>();
  const k = Math.max(1, input.fullConfidencePapers ?? FULL_CONFIDENCE_PAPERS);
  const n = input.topics.length;
  for (const t of input.topics) {
    const subjectPapers = input.subjectPapers.get(t.subjectId) ?? 0;
    const share = input.totalQuestions > 0 ? t.questions / input.totalQuestions : 0;
    if (input.totalQuestions <= 0 || subjectPapers <= 0 || n === 0) {
      out.set(t.topicId, { topicId: t.topicId, questions: t.questions, papers: t.papers, subjectPapers, share, incidence: null, confidence: 0 });
      continue;
    }
    const ratio = share * n;
    const raw = ratio / (ratio + 1);
    const confidence = clamp(subjectPapers / k, 0, 1);
    const incidence = NEUTRAL_INCIDENCE + confidence * (raw - NEUTRAL_INCIDENCE);
    out.set(t.topicId, {
      topicId: t.topicId,
      questions: t.questions,
      papers: Math.min(t.papers, subjectPapers),
      subjectPapers,
      share,
      incidence: Math.round(clamp(incidence, 0, 1) * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
    });
  }
  return out;
}

/** "Caiu em 4 questões, em 2 de 3 provas" — the sample is always shown with the number. */
export function describeIncidence(t: Pick<TopicIncidence, "questions" | "papers" | "subjectPapers">): string {
  if (t.subjectPapers === 0) return "Sem provas oficiais desta disciplina no banco";
  if (t.questions === 0) return `Não caiu nas ${t.subjectPapers} ${t.subjectPapers === 1 ? "prova" : "provas"} analisadas`;
  const q = `${t.questions} ${t.questions === 1 ? "questão" : "questões"}`;
  return `Caiu em ${q}, em ${t.papers} de ${t.subjectPapers} ${t.subjectPapers === 1 ? "prova" : "provas"}`;
}
