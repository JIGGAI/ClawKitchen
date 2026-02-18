import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../agents/skills/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: { readdir: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import fs from "node:fs/promises";

describe("api agents skills route", () => {
  const ws = "/mock-workspace/agent-1";

  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(fs.readdir).mockReset();

    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ id: "agent-1", workspace: ws }]),
      stderr: "",
    });
  });

  it("returns 400 when agentId missing", async () => {
    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("agentId is required");
  });

  it("returns sorted skills on success", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "b-skill", isDirectory: () => true } as never,
      { name: "a-skill", isDirectory: () => true } as never,
      { name: "file.md", isDirectory: () => false } as never,
    ]);

    const res = await GET(
      new Request("https://test?agentId=agent-1")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skills).toEqual(["a-skill", "b-skill"]);
    expect(json.skillsDir).toContain("skills");
  });

  it("returns empty skills with note when readdir fails", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new Request("https://test?agentId=agent-1")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skills).toEqual([]);
    expect(json.note).toBe("ENOENT");
  });
});
