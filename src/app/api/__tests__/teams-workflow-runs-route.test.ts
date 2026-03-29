import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "../teams/workflow-runs/route";

vi.mock("@/lib/workflows/runs-storage", () => ({
  getWorkflowRunsDir: vi.fn(),
  listWorkflowRuns: vi.fn(),
  readWorkflowRun: vi.fn(),
  writeWorkflowRun: vi.fn(),
}));
vi.mock("@/lib/workflows/storage", () => ({
  readWorkflow: vi.fn(),
}));

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    rm: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join("/")),
    resolve: vi.fn((...args: string[]) => args.join("/")),
    basename: vi.fn((p: string) => p.split("/").pop()),
    dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
    sep: "/",
  },
}));

import { getWorkflowRunsDir, listWorkflowRuns, readWorkflowRun, writeWorkflowRun } from "@/lib/workflows/runs-storage";
import { readWorkflow } from "@/lib/workflows/storage";
import { runOpenClaw } from "@/lib/openclaw";

describe("api teams workflow-runs route", () => {
  beforeEach(() => {
    vi.mocked(getWorkflowRunsDir).mockReset();
    vi.mocked(listWorkflowRuns).mockReset();
    vi.mocked(readWorkflowRun).mockReset();
    vi.mocked(writeWorkflowRun).mockReset();
    vi.mocked(readWorkflow).mockReset();
    vi.mocked(runOpenClaw).mockReset();
  });

  it("GET returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("GET returns 400 when workflowId missing", async () => {
    const res = await GET(new Request("https://test?teamId=team1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("workflowId is required");
  });

  it("GET returns 200 with list when no runId", async () => {
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      ok: true,
      dir: "/home/test",
      files: ["run-1.run.json"],
    });
    const res = await GET(new Request("https://test?teamId=team1&workflowId=wf1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.files).toEqual(["run-1.run.json"]);
  });

  it("GET returns 200 with run when runId provided", async () => {
    const run = { id: "run-1", status: "running", nodes: [] };
    vi.mocked(readWorkflowRun).mockResolvedValue({
      ok: true,
      path: "/home/test/run-1.run.json",
      run,
    });
    const res = await GET(new Request("https://test?teamId=team1&workflowId=wf1&runId=run-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run).toEqual(run);
  });

  it("POST returns 400 when teamId missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ workflowId: "wf1", mode: "create" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("POST returns 400 when workflowId missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ teamId: "team1", mode: "create" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("workflowId is required");
  });

  it("POST enqueue returns canonical runId and does not write run artifacts", async () => {
    vi.mocked(readWorkflow).mockResolvedValue({
      ok: true,
      path: "/home/test/wf1.workflow.json",
      workflow: {
        id: "wf1",
        nodes: [
          { id: "start", type: "start" },
          { id: "tool", type: "tool", config: { agentId: "agent-1" } },
          { id: "end", type: "end" },
        ],
      },
    } as unknown as { ok: true; path: string; workflow: { id: string; nodes: Array<{ id: string; type: string; config?: { agentId?: string } }> } });

    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({ ok: true, runId: "2026-03-09t14-46-37-557z-27027444" }),
      stderr: "",
      exitCode: 0,
    } as unknown as { ok: true; stdout: string; stderr: string; exitCode: number });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "team1", workflowId: "wf1", mode: "enqueue" }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.runId).toBe("2026-03-09t14-46-37-557z-27027444");
    expect(json.path).toBe("shared-context/workflow-runs/2026-03-09t14-46-37-557z-27027444/run.json");

    expect(writeWorkflowRun).not.toHaveBeenCalled();
  });

  it("POST stop action changes status to canceled for running runs", async () => {
    const mockRun = {
      schema: "clawkitchen.workflow-run.v1",
      id: "test-run-1",
      workflowId: "wf1",
      startedAt: "2026-03-28T12:00:00Z",
      status: "running",
      nodes: [
        { nodeId: "start", status: "success", startedAt: "2026-03-28T12:00:00Z", endedAt: "2026-03-28T12:00:01Z" },
        { nodeId: "pending-node", status: "pending" },
        { nodeId: "running-node", status: "running", startedAt: "2026-03-28T12:00:02Z" },
      ],
    } as const;

    vi.mocked(readWorkflowRun).mockResolvedValue({
      ok: true,
      path: "/home/test/run.json",
      run: mockRun,
    } as const);

    vi.mocked(writeWorkflowRun).mockResolvedValue({
      ok: true,
      path: "/home/test/run.json",
    } as const);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "team1", workflowId: "wf1", runId: "test-run-1", action: "stop" }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.runId).toBe("test-run-1");

    expect(writeWorkflowRun).toHaveBeenCalledWith("team1", "wf1", expect.objectContaining({
      id: "test-run-1",
      status: "canceled",
      endedAt: expect.any(String),
      nodes: expect.arrayContaining([
        expect.objectContaining({ nodeId: "start", status: "success" }),
        expect.objectContaining({ nodeId: "pending-node", status: "skipped" }),
        expect.objectContaining({ nodeId: "running-node", status: "skipped" }),
      ])
    }));
  });

  it("POST stop action returns error for completed runs", async () => {
    const mockRun = {
      schema: "clawkitchen.workflow-run.v1",
      id: "test-run-1",
      workflowId: "wf1",
      startedAt: "2026-03-28T12:00:00Z",
      endedAt: "2026-03-28T12:05:00Z",
      status: "success",
      nodes: [],
    } as const;

    vi.mocked(readWorkflowRun).mockResolvedValue({
      ok: true,
      path: "/home/test/run.json",
      run: mockRun,
    } as const);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "team1", workflowId: "wf1", runId: "test-run-1", action: "stop" }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Can only stop running or waiting runs");
    expect(writeWorkflowRun).not.toHaveBeenCalled();
  });

  it("POST delete action returns success", async () => {
    const mockRun = {
      schema: "clawkitchen.workflow-run.v1",
      id: "test-run-1",
      workflowId: "wf1",
      startedAt: "2026-03-28T12:00:00Z",
      status: "success",
      nodes: [],
    } as const;

    vi.mocked(readWorkflowRun).mockResolvedValue({
      ok: true,
      path: "/home/test/run.json",
      run: mockRun,
    } as const);

    vi.mocked(getWorkflowRunsDir).mockResolvedValue("/home/test/runs");

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "team1", workflowId: "wf1", runId: "test-run-1", action: "delete" }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(true);
    expect(json.runId).toBe("test-run-1");
  });
});
