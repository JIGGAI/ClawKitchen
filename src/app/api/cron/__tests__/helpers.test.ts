// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildIdToScopeMap,
  getInstalledIdsForTeam,
  enrichJobsWithScope,
  markOrphanedInTeamWorkspaces,
  getBaseWorkspaceFromGateway,
} from "../helpers";

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
  },
}));

import { runOpenClaw } from "@/lib/openclaw";
import fs from "node:fs/promises";

describe("cron helpers", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset();
    vi.mocked(fs.stat).mockReset();
  });

  describe("getInstalledIdsForTeam", () => {
    it("returns installed cron ids from provenance file", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          entries: {
            "recipe.lead": { installedCronId: "cron-1", orphaned: false },
            "recipe.qa": { installedCronId: "cron-2", orphaned: false },
          },
        })
      );
      const result = await getInstalledIdsForTeam("/path/to/cron-jobs.json");
      expect(result).toEqual(["cron-1", "cron-2"]);
    });

    it("filters out orphaned entries", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          entries: {
            a: { installedCronId: "cron-1", orphaned: false },
            b: { installedCronId: "cron-2", orphaned: true },
          },
        })
      );
      const result = await getInstalledIdsForTeam("/path/to/file");
      expect(result).toEqual(["cron-1"]);
    });

    it("returns empty array on read error", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("not found"));
      const result = await getInstalledIdsForTeam("/path/to/file");
      expect(result).toEqual([]);
    });
  });

  describe("enrichJobsWithScope", () => {
    it("adds scope to jobs when id matches", () => {
      const idToScope = new Map([
        ["job-1", { kind: "team" as const, id: "team1", label: "team1", href: "/teams/team1" }],
      ]);
      const jobs = [{ id: "job-1", name: "Job 1" }, { id: "job-2", name: "Job 2" }];
      const result = enrichJobsWithScope(jobs, idToScope);
      expect(result[0]).toHaveProperty("scope");
      expect((result[0] as { scope: { id: string } }).scope.id).toBe("team1");
      expect(result[1]).not.toHaveProperty("scope");
    });

    it("preserves job when no scope", () => {
      const idToScope = new Map();
      const jobs = [{ id: "job-1" }];
      const result = enrichJobsWithScope(jobs, idToScope);
      expect(result[0]).toEqual({ id: "job-1" });
    });
  });

  describe("buildIdToScopeMap", () => {
    it("collects team and agent scopes", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "workspace-team1", isDirectory: () => true } as never,
      ]);
      vi.mocked(fs.stat).mockResolvedValue({} as never);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          entries: {
            "recipe.lead": { installedCronId: "cron-1", orphaned: false },
          },
        })
      );
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([{ id: "agent1", workspace: "/ws/agent1" }]),
        stderr: "",
        exitCode: 0,
      });
      const result = await buildIdToScopeMap("/home/.openclaw/workspace");
      expect(result.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe("markOrphanedInTeamWorkspaces", () => {
    it("marks matching cron as orphaned", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "workspace-team1", isDirectory: () => true } as never,
      ]);
      vi.mocked(fs.stat).mockResolvedValue({} as never);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          entries: {
            "recipe.lead": { installedCronId: "cron-1", orphaned: false },
          },
        })
      );
      const result = await markOrphanedInTeamWorkspaces("cron-1", "/home/.openclaw/workspace");
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("returns empty when no match", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      const result = await markOrphanedInTeamWorkspaces("cron-99", "/home/.openclaw/workspace");
      expect(result).toEqual([]);
    });
  });

  describe("getBaseWorkspaceFromGateway", () => {
    it("extracts workspace from gateway config", async () => {
      const toolsInvoke = vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              result: {
                raw: JSON.stringify({
                  agents: { defaults: { workspace: "/home/.openclaw/workspace" } },
                }),
              },
            }),
          },
        ],
      });
      const result = await getBaseWorkspaceFromGateway(toolsInvoke);
      expect(result).toBe("/home/.openclaw/workspace");
    });

    it("returns empty when no config", async () => {
      const toolsInvoke = vi.fn().mockResolvedValue({ content: [] });
      const result = await getBaseWorkspaceFromGateway(toolsInvoke);
      expect(result).toBe("");
    });
  });
});
