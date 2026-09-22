/**
 * Whether a run's approval should offer Approve / Decline.
 *
 * Normally only while it is pending. But a decision can be recorded and then
 * fail to take effect — e.g. `resume` throws because the approval node was
 * later removed from the workflow file — leaving the run parked in
 * awaiting_approval with nothing to click. A decided approval whose run is
 * still waiting after the resume failed, or long after the decision, is open
 * again so the run can still be dealt with.
 */

/** Longer than a resume takes (the CLI is capped at 2 minutes); shorter than anyone waits to retry. */
export const STUCK_DECISION_MS = 10 * 60_000;

export function approvalNeedsDecision(opts: {
  runAwaiting: boolean;
  decision: string | null | undefined;
  decidedAt?: string | null;
  resumeError?: string | null;
  now: number;
}): boolean {
  if (!opts.runAwaiting) return false;
  if (!opts.decision || opts.decision === "pending") return true;
  if (opts.resumeError) return true;
  const decidedAt = opts.decidedAt ? Date.parse(opts.decidedAt) : Number.NaN;
  return !Number.isFinite(decidedAt) || opts.now - decidedAt > STUCK_DECISION_MS;
}
