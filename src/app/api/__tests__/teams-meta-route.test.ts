import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "../teams/meta/route";
import path from "node:path";

vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() },
}));

import { readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api teams meta route", () => {
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

  describe("GET", () => {
    it("returns 400 when teamId missing", async () => {
      const res = await GET(new Request("https://test/api/teams/meta"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("teamId is required");
    });

    it("returns 500 when workspace not set", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({});
      const res = await GET(new Request("https://test/api/teams/meta?teamId=my-team"));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("agents.defaults.workspace not set");
    });

    it("returns meta when file exists", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ teamId: "my-team", recipeId: "r1" })
      );
      const res = await GET(new Request("https://test/api/teams/meta?teamId=my-team"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.meta).toEqual({ teamId: "my-team", recipeId: "r1" });
    });

    it("returns missing true when file not found", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      const res = await GET(new Request("https://test/api/teams/meta?teamId=my-team"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.meta).toBeNull();
      expect(json.missing).toBe(true);
    });
  });

  describe("POST", () => {
    it("returns 400 when teamId or recipeId missing", async () => {
      const res1 = await POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ recipeId: "r1" }),
        })
      );
      expect(res1.status).toBe(400);
      expect((await res1.json()).error).toBe("teamId is required");

      const res2 = await POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ teamId: "t1" }),
        })
      );
      expect(res2.status).toBe(400);
      expect((await res2.json()).error).toBe("recipeId is required");
    });

    it("writes meta and returns ok", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const res = await POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({
            teamId: "my-team",
            recipeId: "my-recipe",
            recipeName: "My Recipe",
          }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.meta.teamId).toBe("my-team");
      expect(json.meta.recipeId).toBe("my-recipe");
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(path.resolve(baseWorkspace, "..", "workspace-my-team"), "team.json"),
        expect.stringContaining("my-team"),
        "utf8"
      );
    });
  });
});
