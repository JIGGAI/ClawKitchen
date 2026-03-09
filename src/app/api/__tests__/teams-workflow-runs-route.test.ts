import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "../teams/workflow-runs/route";

vi.mock("@/lib/workflows/runs-storage", () => ({
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

import { listWorkflowRuns, readWorkflowRun } from "@/lib/workflows/runs-storage";

describe("api teams workflow-runs route", () => {
  beforeEach(() => {
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
    } as unknown as { ok: true; path: string; workflow: { id: string; nodes: Array<{ id: string; type: string; config?: { agentId?: string } }> } });

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
});
});