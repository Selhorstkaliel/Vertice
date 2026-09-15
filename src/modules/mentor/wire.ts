import type { MentorStreamEvent } from "./llm";
import type { MentorMessageView } from "./queries";

/** NDJSON events streamed by POST /api/mentor, one JSON object per line. */
export type MentorWireEvent = MentorStreamEvent | { type: "done"; message: MentorMessageView } | { type: "error"; error: string };
