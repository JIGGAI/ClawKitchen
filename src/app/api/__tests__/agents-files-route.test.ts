import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../agents/files/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: { stat: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import fs from "node:fs/promises";

describe("api agents files route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(fs.stat).mockReset();
  });

  it("returns 400 when agentId missing", async () => {
    const res = await GET(new Request("https://test/api/agents/files"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("agentId is required");
  });

  it("returns ok with files", async () => {
    const ws = "/mock-workspace/agent-1";
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ id: "agent-1", workspace: ws }]),
      stderr: "",
    });
    vi.mocked(fs.stat)
      .mockResolvedValueOnce({ size: 100, mtimeMs: 123 } as never)
      .mockRejectedValueOnce(new Error("ENOENT"));

    const res = await GET(new Request("https://test/api/agents/files?agentId=agent-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agentId).toBe("agent-1");
    expect(json.workspace).toBe(ws);
    expect(json.files).toBeDefined();
    expect(json.files.some((f: { name: string }) => f.name === "IDENTITY.md")).toBe(true);
  });

  it("throws when agent workspace not found", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ id: "other" }]),
      stderr: "",
    });

    await expect(
      GET(new Request("https://test/api/agents/files?agentId=missing"))
    ).rejects.toThrow("Agent workspace not found");
  });
});
