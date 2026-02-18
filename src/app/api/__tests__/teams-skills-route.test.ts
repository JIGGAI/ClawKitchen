import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../teams/skills/route";

vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  default: { readdir: vi.fn() },
}));

import { readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api teams skills route", () => {
  const baseWorkspace = "/mock-workspace";

  beforeEach(() => {
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(fs.readdir).mockReset();

    vi.mocked(readOpenClawConfig).mockResolvedValue({
      agents: { defaults: { workspace: baseWorkspace } },
    });
  });

  it("returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 500 when workspace not set", async () => {
    vi.mocked(readOpenClawConfig).mockResolvedValue({});

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("agents.defaults.workspace not set");
  });

  it("returns sorted skills on success", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "skill-b", isDirectory: () => true } as never,
      { name: "skill-a", isDirectory: () => true } as never,
      { name: "README.md", isDirectory: () => false } as never,
    ]);

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skills).toEqual(["skill-a", "skill-b"]);
  });

  it("returns empty skills with note when skills dir missing", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skills).toEqual([]);
    expect(json.note).toBe("ENOENT");
  });
});
