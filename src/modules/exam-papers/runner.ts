import "server-only";
import { runPaperExtraction } from "./extract";

/** Papers being read by this server process; the database lease covers other processes. */
const running = new Set<string>();

/**
 * Starts reading a paper without holding the request open. Progress is saved
 * batch by batch, so a restart only loses the batch in flight.
 */
export function startExtraction(paperId: string) {
  if (running.has(paperId)) return false;
  running.add(paperId);
  void runPaperExtraction(paperId)
    .catch((err) => console.error("[exam-papers] background extraction crashed", paperId, err))
    .finally(() => running.delete(paperId));
  return true;
}
