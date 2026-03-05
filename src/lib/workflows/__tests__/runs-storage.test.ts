// -environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertSafeRunId,
  workflowRunFileName,
  getWorkflowRunsDir,
  listWorkflowRuns,
  readWorkflowRun,
  writeWorkflowRun,
  listAllWorkflowRuns,
} from "../runs-storage";

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn().mockResolvedValue("/home/test/workspace/team1"),
}));

vi.mock("@/lib/workflows/readdir", () => ({
  readdirFiles: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
}));

import fs from "node:fs/promises";
import { readdirFiles } from "@/lib/workflows/readdir";

describe("lib/workflows runs-storage", () => {
  beforeEach(() => {
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(readdirFiles).mockReset();
  });

  describe("assertSafeRunId", () => {
    it("returns trimmed id when valid", () => {
      expect(assertSafeRunId("  run-123 ")).toBe("run-123");
    });

    it("throws on empty", () => {
      expect(() => assertSafeRunId("")).toThrow(/run id is required/i);
      expect(() => assertSafeRunId("   ")).toThrow(/run id is required/i);
    });

    it("throws on invalid characters", () => {
      expect(() => assertSafeRunId("UPPER")).toThrow(/invalid run id/i);
      expect(() => assertSafeRunId("has_space")).toThrow(/invalid run id/i);
      expect(() => assertSafeRunId("../oops")).toThrow(/invalid run id/i);
    });
  });

  describe("workflowRunFileName", () => {
    it("returns <runId>.run.json", () => {
      expect(workflowRunFileName("abc")).toBe("abc.run.json");
    });
  });

  describe("getWorkflowRunsDir", () => {
    it("returns team workspace + shared-context/workflow-runs", async () => {
      const dir = await getWorkflowRunsDir("team1", "wf1");
      expect(dir).toBe("/home/test/workspace/team1/shared-context/workflow-runs");
    });
  });

  describe("listWorkflowRuns", () => {
    it("filters root-run files by Kitchen schema workflowId", async () => {
      vi.mocked(readdirFiles).mockResolvedValue({ ok: true, dir: "/x", files: ["a.run.json", "b.run.json"] });

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).includes("a.run.json")) return JSON.stringify({ schema: "clawkitchen.workflow-run.v1", workflowId: "wf1" });
        if (String(p).includes("b.run.json")) return JSON.stringify({ schema: "clawkitchen.workflow-run.v1", workflowId: "wf2" });
        return "{}";
      });

      const r = await listWorkflowRuns("team1", "wf1");
      expect(r.ok).toBe(true);
      expect(r.files).toEqual(["a.run.json"]);
    });

    it("filters root-run files by Runner schema workflow.id/file", async () => {
      vi.mocked(readdirFiles).mockResolvedValue({ ok: true, dir: "/x", files: ["r1.run.json", "r2.run.json"] });

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).includes("r1.run.json")) {
          return JSON.stringify({ runId: "r1", workflow: { id: "wf1" } });
        }
        if (String(p).includes("r2.run.json")) {
          return JSON.stringify({ runId: "r2", workflow: { file: "/home/test/wf1.workflow.json" } });
        }
        return "{}";
      });

      const r = await listWorkflowRuns("team1", "wf1");
      expect(r.ok).toBe(true);
      expect(r.files.sort()).toEqual(["r1.run.json", "r2.run.json"].sort());
    });

    it("falls back to legacy per-workflow directory when no root matches", async () => {
      vi.mocked(readdirFiles)
        // root scan
        .mockResolvedValueOnce({ ok: true, dir: "/x", files: ["a.run.json"] })
        // legacy scan
        .mockResolvedValueOnce({ ok: true, dir: "/x/wf1", files: ["legacy.run.json"] });

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ schema: "clawkitchen.workflow-run.v1", workflowId: "other" }));

      const r = await listWorkflowRuns("team1", "wf1");
      expect(r.ok).toBe(true);
      expect(r.dir).toContain("/wf1");
      expect(r.files).toEqual(["legacy.run.json"]);
    });
  });

  describe("readWorkflowRun", () => {
    it("reads root-run file and normalizes runner schema", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          runId: "run-1",
          createdAt: "2026-03-05T00:00:00.000Z",
          updatedAt: "2026-03-05T00:01:00.000Z",
          status: "completed",
          workflow: { id: "wf1" },
          nodeResults: [{ nodeId: "n1", status: "completed", output: { ok: true } }],
        })
      );

      const r = await readWorkflowRun("team1", "wf1", "run-1");
      expect(r.ok).toBe(true);
      expect(r.run.schema).toBe("clawkitchen.workflow-run.v1");
      expect(r.run.id).toBe("run-1");
      expect(r.run.workflowId).toBe("wf1");
      expect(r.run.status).toBe("success");
      expect(r.run.nodes?.[0]).toMatchObject({ nodeId: "n1", status: "success" });
    });

    it("falls back to legacy per-workflow file when root missing", async () => {
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce({ code: "ENOENT" })
        .mockResolvedValueOnce(JSON.stringify({ schema: "clawkitchen.workflow-run.v1", id: "run-2", workflowId: "wf1", teamId: "team1", startedAt: "x", status: "running" }));

      const r = await readWorkflowRun("team1", "wf1", "run-2");
      expect(r.ok).toBe(true);
      expect(r.path).toContain("/wf1/");
      expect(r.run.id).toBe("run-2");
      expect(r.run.status).toBe("running");
    });
  });

  describe("writeWorkflowRun", () => {
    it("writes to root by default", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const r = await writeWorkflowRun("team1", "wf1", {
        schema: "clawkitchen.workflow-run.v1",
        id: "run-3",
        workflowId: "wf1",
        teamId: "team1",
        startedAt: "x",
        status: "running",
        summary: "hi",
      });

      expect(r.ok).toBe(true);
      expect(r.path).toContain("/shared-context/workflow-runs/run-3.run.json");
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("run-3.run.json"),
        expect.stringContaining('"schema": "clawkitchen.workflow-run.v1"'),
        "utf8"
      );
    });

    it("writes to legacy per-workflow dir when root file is a runner log", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      // root file exists and looks like runner log (has runId but no schema)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ runId: "run-4", workflow: { id: "wf1" } }));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const r = await writeWorkflowRun("team1", "wf1", {
        schema: "clawkitchen.workflow-run.v1",
        id: "run-4",
        workflowId: "wf1",
        teamId: "team1",
        startedAt: "x",
        status: "running",
        summary: "hi",
      });

      expect(r.ok).toBe(true);
      expect(r.path).toContain("/shared-context/workflow-runs/wf1/run-4.run.json");
    });
  });

  describe("listAllWorkflowRuns", () => {
    it("lists root runs and legacy runs (best-effort)", async () => {
      // root dir contains a run file and a per-workflow directory
      vi.mocked(fs.readdir)
        .mockImplementationOnce(async () => ["r1.run.json", "wfLegacy"] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockImplementationOnce(async () => [{ name: "wfLegacy", isDirectory: () => true }] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockImplementationOnce(async () => ["legacy1.run.json"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).endsWith("r1.run.json")) {
          return JSON.stringify({ schema: "clawkitchen.workflow-run.v1", id: "r1", workflowId: "wf1", teamId: "team1", startedAt: "t", status: "running", summary: "x" });
        }
        return JSON.stringify({ schema: "clawkitchen.workflow-run.v1", id: "legacy1", workflowId: "wfLegacy", teamId: "team1", startedAt: "t", status: "success", summary: "x" });
      });

      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date("2026-03-05T00:00:00.000Z") } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const r = await listAllWorkflowRuns("team1");
      expect(r.ok).toBe(true);
      expect(r.runs.map((x) => x.runId).sort()).toEqual(["r1", "legacy1"].sort());
    });
  });
});
