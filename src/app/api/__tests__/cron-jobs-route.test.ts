import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../cron/jobs/route";

vi.mock("@/lib/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway")>();
  return { ...actual, toolsInvoke: vi.fn() };
});
vi.mock("@/lib/paths", () => ({ getTeamWorkspaceDir: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));

import { toolsInvoke } from "@/lib/gateway";
import { getTeamWorkspaceDir } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api cron jobs route", () => {
  beforeEach(() => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(getTeamWorkspaceDir).mockReset();
    vi.mocked(fs.readFile).mockReset();
  });

  it("returns empty jobs when toolsInvoke has no text", async () => {
    vi.mocked(toolsInvoke).mockResolvedValue({ content: [] });

    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobs).toEqual([]);
  });

  it("returns jobs when no teamId", async () => {
    const jobs = [{ id: "j1", name: "Job 1" }];
    vi.mocked(toolsInvoke).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ jobs }) }],
    });

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
    vi.mocked(toolsInvoke).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ jobs: allJobs }) }],
    });
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
    vi.mocked(toolsInvoke).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ jobs: [{ id: "j1" }] }) }],
    });
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

  it("returns 500 when toolsInvoke throws", async () => {
    vi.mocked(toolsInvoke).mockRejectedValue(new Error("Gateway unavailable"));

    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Gateway unavailable");
  });
});
