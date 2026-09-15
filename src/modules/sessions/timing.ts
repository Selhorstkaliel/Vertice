/** Effective (non-paused) seconds of a study session at a given instant. */
export function effectiveSecondsAt(
  s: { startedAt: Date; pausedAt: Date | null; pausedSeconds: number; status: string },
  at: Date,
) {
  const pausedNow = s.status === "PAUSED" && s.pausedAt ? (at.getTime() - s.pausedAt.getTime()) / 1000 : 0;
  return Math.max(0, Math.floor((at.getTime() - s.startedAt.getTime()) / 1000 - s.pausedSeconds - pausedNow));
}
