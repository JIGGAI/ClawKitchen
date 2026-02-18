import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT } from "../teams/file/route";

vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api teams file route", () => {
  const baseWorkspace = "/mock-workspace";

  beforeEach(() => {
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();

    vi.mocked(readOpenClawConfig).mockResolvedValue({
      agents: { defaults: { workspace: baseWorkspace } },
    });
  });

  it("returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test/api/teams/file?name=TEAM.md"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 400 when name missing", async () => {
    const res = await GET(new Request("https://test/api/teams/file?teamId=my-team"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("name is required");
  });

  it("returns 404 when file missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new Request("https://test/api/teams/file?teamId=my-team&name=TEAM.md")
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns content on success", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("# Team\n\nContent");

    const res = await GET(
      new Request("https://test/api/teams/file?teamId=my-team&name=TEAM.md")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.content).toBe("# Team\n\nContent");
    expect(json.name).toBe("TEAM.md");
  });

  it("throws on path traversal in name", async () => {
    await expect(
      GET(new Request("https://test/api/teams/file?teamId=my-team&name=../etc/passwd"))
    ).rejects.toThrow("Invalid file name");
  });

  describe("PUT", () => {
    it("returns 400 when teamId, name, or content missing", async () => {
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
          body: JSON.stringify({ teamId: "my-team", content: "c" }),
        })
      );
      expect(r2.status).toBe(400);

      const r3 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ teamId: "my-team", name: "TEAM.md" }),
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
            teamId: "my-team",
            name: "TEAM.md",
            content: "# Team\n\nNew content",
          }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.name).toBe("TEAM.md");
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("TEAM.md"),
        "# Team\n\nNew content",
        "utf8"
      );
    });
  });
});