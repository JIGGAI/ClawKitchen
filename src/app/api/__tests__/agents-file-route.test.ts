import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT } from "../agents/file/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import fs from "node:fs/promises";

describe("api agents file route", () => {
  const ws = "/mock-workspace/agent-1";

  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();

    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ id: "agent-1", workspace: ws }]),
      stderr: "",
    });
  });

  describe("GET", () => {
    it("returns 400 when agentId or name missing", async () => {
      const r1 = await GET(new Request("https://test?name=IDENTITY.md"));
      expect(r1.status).toBe(400);
      expect((await r1.json()).error).toBe("agentId is required");

      const r2 = await GET(new Request("https://test?agentId=agent-1"));
      expect(r2.status).toBe(400);
      expect((await r2.json()).error).toBe("name is required");
    });

    it("returns 404 when file missing", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      const res = await GET(
        new Request("https://test?agentId=agent-1&name=IDENTITY.md")
      );
      expect(res.status).toBe(404);
    });

    it("returns content on success", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("# Identity\n\nContent");
      const res = await GET(
        new Request("https://test?agentId=agent-1&name=IDENTITY.md")
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.content).toBe("# Identity\n\nContent");
    });

    it("throws on path traversal", async () => {
      await expect(
        GET(new Request("https://test?agentId=agent-1&name=../etc/passwd"))
      ).rejects.toThrow("Invalid file name");
    });
  });

  describe("PUT", () => {
    it("returns 400 when agentId, name, or content missing", async () => {
      const r1 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ name: "X", content: "c" }),
        })
      );
      expect(r1.status).toBe(400);

      const r2 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ agentId: "a", content: "c" }),
        })
      );
      expect(r2.status).toBe(400);

      const r3 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ agentId: "a", name: "X" }),
        })
      );
      expect(r3.status).toBe(400);
    });

    it("writes file and returns ok", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({
            agentId: "agent-1",
            name: "IDENTITY.md",
            content: "# New",
          }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("IDENTITY.md"),
        "# New",
        "utf8"
      );
    });
  });
});
