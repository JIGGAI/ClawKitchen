import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../teams/files/route";

vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  default: { stat: vi.fn() },
}));

import { readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api teams files route", () => {
  const baseWorkspace = "/mock-workspace";

  beforeEach(() => {
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(fs.stat).mockReset();

    vi.mocked(readOpenClawConfig).mockResolvedValue({
      agents: { defaults: { workspace: baseWorkspace } },
    });
  });

  it("returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test/api/teams/files"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 500 when workspace not set", async () => {
    vi.mocked(readOpenClawConfig).mockResolvedValue({});

    const res = await GET(new Request("https://test/api/teams/files?teamId=my-team"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("agents.defaults.workspace not set");
  });

  it("returns files with missing flags", async () => {
    vi.mocked(fs.stat)
      .mockResolvedValueOnce({ size: 100, mtimeMs: 123456 } as never)
      .mockRejectedValueOnce(new Error("ENOENT"));

    const res = await GET(new Request("https://test/api/teams/files?teamId=my-team"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.teamId).toBe("my-team");
    expect(json.files).toBeDefined();
    expect(json.files.some((f: { name: string }) => f.name === "TEAM.md")).toBe(true);
    expect(json.files.some((f: { missing: boolean }) => f.missing === true)).toBe(true);
  });
});
