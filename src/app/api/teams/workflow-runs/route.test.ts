// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let TEAM_DIR = "";

vi.mock("@/lib/paths", async () => {
  const actual = await vi.importActual<typeof import("@/lib/paths")>("@/lib/paths");
  return {
    ...actual,
    getTeamWorkspaceDir: async () => TEAM_DIR,
    readOpenClawConfig: async () => ({ bindings: [] }),
  };
});

const toolsInvokeMock = vi.fn(async ({ tool }: { tool: string }) => {
  if (tool === "exec") {
    return { ok: true, stdout: "hi\n", stderr: "", exitCode: 0 };
  }
  return { ok: true };
});

vi.mock("@/lib/gateway", () => ({
  toolsInvoke: toolsInvokeMock,
}));

const runOpenClawMock = vi.fn(async () => {
  return { ok: true, stdout: JSON.stringify({ ok: true, runId: "run-123", runLogPath: "<mock>" }), stderr: "" };
});

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: runOpenClawMock,
}));

describe("/api/teams/workflow-runs POST (enqueue for runner)", () => {
  beforeEach(async () => {
    toolsInvokeMock.mockClear();
    TEAM_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "clawkitchen-team-"));

    // Enable runtime.exec for tests (dev-only feature).
    process.env.KITCHEN_ENABLE_WORKFLOW_RUNTIME_EXEC = "1";
    process.env.KITCHEN_WORKFLOW_EXEC_BACKEND = "local";

    vi.resetModules();
  });

  afterEach(async () => {
    if (TEAM_DIR) {
      await fs.rm(TEAM_DIR, { recursive: true, force: true });
    }
  });

  it("enqueues a runner-friendly run log and returns a pending Kitchen run", async () => {
    const teamId = "development-team";
    const workflowId = "wf-append";

    const { writeWorkflow } = await import("@/lib/workflows/storage");
    await writeWorkflow(teamId, {
      schema: "clawkitchen.workflow.v1",
      id: workflowId,
      name: "Append test",
      nodes: [
        {
          id: "n1",
          type: "tool",
          config: {
            tool: "fs.append",
            args: { path: "notes/log.txt", content: "hello" },
            agentId: "development-team-dev",
          },
        },
        {
          id: "approval",
          type: "human_approval",
          config: {
            provider: "telegram",
            target: "(set in UI)",
            messageTemplate: "Approval needed",
          },
        },
      ],
    });

    const { POST } = await import("./route");

    const res = await POST(
      new Request("http://localhost/api/teams/workflow-runs", {
        method: "POST",
        body: JSON.stringify({ teamId, workflowId, mode: "execute" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; path: string; runId: string };
    expect(json.ok).toBe(true);
    expect(json.runId).toBe("run-123");

    const runRaw = await fs.readFile(json.path, "utf8");
    const run = JSON.parse(runRaw) as import("@/lib/workflows/runs-types").WorkflowRunFileV1;

    // Kitchen now enqueues; it does not execute nodes.
    expect(run.status).toBe("running");
    expect(run.nodes).toHaveLength(2);
    expect(run.nodes[0].status).toBe("pending");
    expect(run.nodes[1].status).toBe("pending");

    // Runner-friendly run log creation is delegated to ClawRecipes (CLI) now.
    // We only assert that the API returned a runId and did not execute locally.

    // No local side effects (fs.append should not have run).
    await expect(fs.readFile(path.join(TEAM_DIR, "notes", "log.txt"), "utf8")).rejects.toThrow();
    expect(toolsInvokeMock).not.toHaveBeenCalled();
  });

  it("does not execute runtime.exec during enqueue (runner enforces allowlist)", async () => {
    const teamId = "development-team";
    const workflowId = "wf-exec-deny";

    const { writeWorkflow } = await import("@/lib/workflows/storage");
    await writeWorkflow(teamId, {
      schema: "clawkitchen.workflow.v1",
      id: workflowId,
      name: "Exec deny test",
      nodes: [
        {
          id: "n1",
          type: "tool",
          config: {
            tool: "runtime.exec",
            args: { command: "echo hi" },
            agentId: "development-team-dev",
          },
        },
      ],
    });

    const { POST } = await import("./route");

    const res = await POST(
      new Request("http://localhost/api/teams/workflow-runs", {
        method: "POST",
        body: JSON.stringify({ teamId, workflowId, mode: "execute" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; path: string; runId: string };

    const runRaw = await fs.readFile(json.path, "utf8");
    const run = JSON.parse(runRaw) as import("@/lib/workflows/runs-types").WorkflowRunFileV1;

    // Kitchen now enqueues; it does not enforce runtime.exec allowlists.
    expect(run.status).toBe("running");
    expect(run.nodes[0].status).toBe("pending");
    expect(toolsInvokeMock).not.toHaveBeenCalled();
  });

  it("preserves runtime.exec node as pending during enqueue", async () => {
    const teamId = "development-team";
    const workflowId = "wf-exec-allow";

    const { writeWorkflow } = await import("@/lib/workflows/storage");
    await writeWorkflow(teamId, {
      schema: "clawkitchen.workflow.v1",
      id: workflowId,
      name: "Exec allow test",
      meta: { execAllowBins: ["echo"] },
      nodes: [
        {
          id: "n1",
          type: "tool",
          config: {
            tool: "runtime.exec",
            args: { command: "echo hi" },
            agentId: "development-team-dev",
          },
        },
      ],
    });

    const { POST } = await import("./route");

    const res = await POST(
      new Request("http://localhost/api/teams/workflow-runs", {
        method: "POST",
        body: JSON.stringify({ teamId, workflowId, mode: "execute" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; path: string; runId: string };

    const runRaw = await fs.readFile(json.path, "utf8");
    const run = JSON.parse(runRaw) as import("@/lib/workflows/runs-types").WorkflowRunFileV1;

    expect(run.status).toBe("running");
    expect(run.nodes[0].status).toBe("pending");
    expect(toolsInvokeMock).not.toHaveBeenCalled();
  });
});
