import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../cron/jobs/route";

vi.mock("@/lib/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway")>();
  return { ...actual, toolsInvoke: vi.fn() };
});
vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return {
    ...actual,
    getTeamWorkspaceDir: vi.fn(),
    readOpenClawConfig: vi.fn().mockResolvedValue({ agents: { defaults: { workspace: "/home/test/.openclaw/agents" } } }),
  };
});
vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn().mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ jobs: [] }), stderr: "" }) }));
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn(),
  },
}));

import { toolsInvoke } from "@/lib/gateway";
import { runOpenClaw } from "@/lib/openclaw";
import { getTeamWorkspaceDir } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api cron jobs route", () => {
  beforeEach(() => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(getTeamWorkspaceDir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readdir).mockResolvedValue([]);
  });

  it("returns empty jobs when cron list returns empty jobs", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ jobs: [] }), stderr: "" });

    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobs).toEqual([]);
  });

  it("returns jobs when no teamId", async () => {
    const jobs = [{ id: "j1", name: "Job 1" }];
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ jobs }), stderr: "" });

    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobs).toEqual(jobs);
  });

  it("filters by team when teamId provided", async () => {
    const allJobs = [
      { id: "j1" },
      { id: "j2" },
      { id: "j3" },
    ];
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ jobs: allJobs }), stderr: "" });
    vi.mocked(getTeamWorkspaceDir).mockResolvedValue("/home/x/.openclaw/workspace-my-team");
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        entries: {
          a: { installedCronId: "j1", orphaned: false },
          b: { installedCronId: "j3", orphaned: false },
          c: { installedCronId: "j99", orphaned: true },
        },
      })
    );

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobs).toHaveLength(2);
    expect(json.jobs.map((j: { id: string }) => j.id)).toEqual(["j1", "j3"]);
    expect(json.installedIds).toEqual(["j1", "j3"]);
  });

  it("returns empty filtered jobs when provenance file missing", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ jobs: [{ id: "j1" }] }), stderr: "" });
    vi.mocked(getTeamWorkspaceDir).mockResolvedValue("/home/x/.openclaw/workspace-t");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobs).toEqual([]);
    expect(json.installedIds).toEqual([]);
  });

  it("returns 500 when cron list fails", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "Gateway unavailable" });

    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Gateway unavailable");
  });
});
