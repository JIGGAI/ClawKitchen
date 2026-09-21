import { describe, expect, it } from "vitest";
import { STUCK_DECISION_MS, approvalNeedsDecision } from "@/lib/workflows/approval-state";

const NOW = Date.parse("2026-09-21T20:30:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("approvalNeedsDecision", () => {
  it("is open while the approval is pending (or has no decision yet)", () => {
    expect(approvalNeedsDecision({ runAwaiting: true, decision: "pending", now: NOW })).toBe(true);
    expect(approvalNeedsDecision({ runAwaiting: true, decision: null, now: NOW })).toBe(true);
  });

  it("is closed once the run has moved on", () => {
    expect(approvalNeedsDecision({ runAwaiting: false, decision: "pending", now: NOW })).toBe(false);
  });

  it("stays closed right after a decision, while the resume is expected", () => {
    expect(approvalNeedsDecision({ runAwaiting: true, decision: "rejected", decidedAt: ago(60_000), now: NOW })).toBe(false);
  });

  it("reopens when the resume failed, or the decision never took effect", () => {
    expect(
      approvalNeedsDecision({ runAwaiting: true, decision: "rejected", decidedAt: ago(1000), resumeError: "Approval node not found", now: NOW }),
    ).toBe(true);
    expect(approvalNeedsDecision({ runAwaiting: true, decision: "approved", decidedAt: ago(STUCK_DECISION_MS + 1), now: NOW })).toBe(true);
    expect(approvalNeedsDecision({ runAwaiting: true, decision: "rejected", decidedAt: null, now: NOW })).toBe(true);
  });
});
