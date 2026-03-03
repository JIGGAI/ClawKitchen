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

describe("/api/teams/workflow-runs POST (execute)", () => {
  beforeEach(async () => {
    toolsInvokeMock.mockClear();
    TEAM_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "clawkitchen-team-"));
    vi.resetModules();
  });

  afterEach(async () => {
    if (TEAM_DIR) {
      await fs.rm(TEAM_DIR, { recursive: true, force: true });
    }
  });

  it("executes fs.append tool node and persists run file", async () => {
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
    expect(json.runId).toMatch(/^run-/);

    const runRaw = await fs.readFile(json.path, "utf8");
    const run = JSON.parse(runRaw) as import("@/lib/workflows/runs-types").WorkflowRunFileV1;

    expect(run.status).toBe("success");
    expect(run.nodes).toHaveLength(1);
    expect(run.nodes[0].status).toBe("success");
    expect(run.nodes[0].output.tool).toBe("fs.append");
    expect(String(run.nodes[0].output.appendedTo)).toContain(path.join(TEAM_DIR, "notes", "log.txt"));

    const appended = await fs.readFile(path.join(TEAM_DIR, "notes", "log.txt"), "utf8");
    expect(appended).toBe("hello");
  });

  it("denies runtime.exec when bin is not allowlisted", async () => {
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

    expect(run.status).toBe("error");
    expect(run.nodes[0].status).toBe("error");
    expect(String(run.nodes[0].output.error)).toContain("not allowlisted");
    expect(toolsInvokeMock).not.toHaveBeenCalled();
  });

  it("allows runtime.exec when bin is allowlisted in workflow meta", async () => {
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

    expect(run.status).toBe("success");
    expect(run.nodes[0].status).toBe("success");
    expect(run.nodes[0].output.tool).toBe("runtime.exec");

    expect(toolsInvokeMock).toHaveBeenCalledTimes(1);
  });
});
