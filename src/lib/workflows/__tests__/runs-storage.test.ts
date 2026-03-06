import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertSafeRunId,
  listAllWorkflowRuns,
  listWorkflowRuns,
  readWorkflowRun,
} from "@/lib/workflows/runs-storage";

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn().mockResolvedValue("/home/test/.openclaw/workspace-team1"),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock("@/lib/workflows/readdir", () => ({
  readdirFiles: vi.fn().mockResolvedValue({ ok: true, dir: "/x", files: [] }),
}));

import fs from "node:fs/promises";

type FakeDirent = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
};

function dirent(name: string): FakeDirent {
  return {
    name,
    isDirectory: () => true,
    isFile: () => false,
  };
}

describe("lib/workflows/runs-storage", () => {
  beforeEach(() => {
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.stat).mockReset();
  });

  describe("assertSafeRunId", () => {
    it("accepts ISO-ish runner ids", () => {
      expect(assertSafeRunId("2026-03-05t05-26-53-175z-8b008e9f")).toBe(
        "2026-03-05t05-26-53-175z-8b008e9f"
      );
    });
  });

  it("lists runner directory-per-run layout", async () => {
    // listAllWorkflowRuns() checks both:
    // - runner dir-per-run layout (withFileTypes)
    // - legacy flat *.run.json layout (string[])
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        dirent("run-1"),
        dirent("run-2"),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
      const s = String(p);
      if (s.endsWith("/run-1/run.json")) {
        return JSON.stringify({
          runId: "run-1",
          createdAt: "2026-03-05T00:00:00.000Z",
          updatedAt: "2026-03-05T00:01:00.000Z",
          status: "completed",
          workflow: { id: "wf-a", file: "/x/wf-a.workflow.json" },
          nodeResults: [{ nodeId: "n1", status: "completed", output: { hello: "world" } }],
        });
      }
      if (s.endsWith("/run-2/run.json")) {
        return JSON.stringify({
          runId: "run-2",
          createdAt: "2026-03-05T00:02:00.000Z",
          updatedAt: "2026-03-05T00:03:00.000Z",
          status: "error",
          workflow: { id: "wf-b", file: "/x/wf-b.workflow.json" },
          nodeResults: [{ nodeId: "n1", status: "error", error: "boom" }],
        });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    vi.mocked(fs.stat).mockResolvedValue(
      { mtime: new Date("2026-03-05T00:03:00.000Z") } as unknown as Awaited<ReturnType<typeof fs.stat>>
    );

    const r = await listAllWorkflowRuns("team1");
    expect(r.ok).toBe(true);
    expect(r.runs.length).toBe(2);
    expect(r.runs.map((x) => x.runId).sort()).toEqual(["run-1", "run-2"]);
  });

  it("reads runner run.json and hydrates node outputs", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
      const s = String(p);
      if (s.endsWith("/run-1/run.json")) {
        return JSON.stringify({
          runId: "run-1",
          createdAt: "2026-03-05T00:00:00.000Z",
          updatedAt: "2026-03-05T00:01:00.000Z",
          status: "completed",
          workflow: { id: "wf-a", file: "/x/wf-a.workflow.json" },
          nodeResults: [
            {
              nodeId: "draft",
              status: "completed",
            },
          ],
        });
      }
      if (s.endsWith("/run-1/node-outputs/001-draft.json")) {
        return JSON.stringify({ text: "hello" });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      "001-draft.json",
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const r = await readWorkflowRun("team1", "wf-a", "run-1");
    expect(r.ok).toBe(true);
    expect(r.run.workflowId).toBe("wf-a");
    expect(r.run.nodes?.[0]?.nodeId).toBe("draft");
    expect((r.run.nodes?.[0] as { output?: unknown }).output).toEqual({ text: "hello" });
  });

  it("lists workflow run ids for a workflow", async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      dirent("run-1"),
      dirent("run-2"),
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
      const s = String(p);
      if (s.endsWith("/run-1/run.json")) {
        return JSON.stringify({
          runId: "run-1",
          createdAt: "2026-03-05T00:00:00.000Z",
          updatedAt: "2026-03-05T00:01:00.000Z",
          status: "completed",
          workflow: { id: "wf-a", file: "/x/wf-a.workflow.json" },
          nodeResults: [],
        });
      }
      if (s.endsWith("/run-2/run.json")) {
        return JSON.stringify({
          runId: "run-2",
          createdAt: "2026-03-05T00:02:00.000Z",
          updatedAt: "2026-03-05T00:03:00.000Z",
          status: "completed",
          workflow: { id: "wf-b", file: "/x/wf-b.workflow.json" },
          nodeResults: [],
        });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const r = await listWorkflowRuns("team1", "wf-a");
    expect(r.ok).toBe(true);
    expect(r.runIds).toContain("run-1");
    expect(r.runIds).not.toContain("run-2");
  });
});
