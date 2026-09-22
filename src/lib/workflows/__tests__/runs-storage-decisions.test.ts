import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ root: "" }));

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn(async (teamId: string) => `${ctx.root}/workspace-${teamId}`),
}));

import { cancelRunnerWorkflowRun, writeApprovalFile } from "@/lib/workflows/runs-storage";

const RUN = "2026-06-24t02-06-22-635z-b5423738";
const runDir = () => path.join(ctx.root, "workspace-team", "shared-context", "workflow-runs", RUN);
const readJson = async (p: string) => JSON.parse(await fs.readFile(p, "utf8")) as Record<string, unknown>;

beforeEach(async () => {
  ctx.root = await fs.mkdtemp(path.join(os.tmpdir(), "ck-run-decisions-"));
  await fs.mkdir(path.join(runDir(), "approvals"), { recursive: true });
  await fs.writeFile(
    path.join(runDir(), "run.json"),
    JSON.stringify({
      runId: RUN,
      status: "awaiting_approval",
      nodeStates: { draft: { status: "success", ts: "t0" }, approve: { status: "waiting", ts: "t1" } },
      events: [{ type: "node.awaiting_approval", nodeId: "approve" }],
    }),
  );
  await fs.writeFile(
    path.join(runDir(), "approvals", "approval.json"),
    JSON.stringify({ runId: RUN, nodeId: "approve", status: "pending", code: "XRXCJL" }),
  );
});

afterEach(async () => {
  await fs.rm(ctx.root, { recursive: true, force: true });
});

describe("writeApprovalFile", () => {
  it("keeps the engine's fields and records the resume bookkeeping it is given", async () => {
    await writeApprovalFile("team", "flow", RUN, "approve", {
      state: "rejected",
      decidedAt: "2026-09-21T20:00:00.000Z",
      resumedAt: "2026-09-21T20:00:01.000Z",
      resumedStatus: "error",
      resumeError: "Approval node not found",
    });
    expect(await readJson(path.join(runDir(), "approvals", "approval.json"))).toEqual({
      runId: RUN,
      nodeId: "approve",
      status: "rejected",
      code: "XRXCJL",
      decidedAt: "2026-09-21T20:00:00.000Z",
      resumedAt: "2026-09-21T20:00:01.000Z",
      resumedStatus: "error",
      resumeError: "Approval node not found",
    });
  });
});

describe("cancelRunnerWorkflowRun", () => {
  it("cancels the run and marks the approval node declined, keeping the rest of the log", async () => {
    await cancelRunnerWorkflowRun("team", "flow", RUN, { nodeId: "approve", at: "2026-09-21T20:05:00.000Z", decidedBy: "RJ" });
    const run = await readJson(path.join(runDir(), "run.json"));
    expect(run).toMatchObject({
      status: "canceled",
      updatedAt: "2026-09-21T20:05:00.000Z",
      nodeStates: {
        draft: { status: "success", ts: "t0" },
        approve: { status: "error", ts: "2026-09-21T20:05:00.000Z", message: "declined" },
      },
    });
    expect(run.events).toEqual([
      { type: "node.awaiting_approval", nodeId: "approve" },
      { type: "approval.declined", nodeId: "approve", decidedBy: "RJ", ts: "2026-09-21T20:05:00.000Z" },
      { type: "run.canceled", reason: "approval_declined", ts: "2026-09-21T20:05:00.000Z" },
    ]);
  });
});
