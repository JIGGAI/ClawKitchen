import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT } from "../recipes/[id]/route";
import path from "node:path";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  findRecipeById: vi.fn(),
  parseFrontmatterId: vi.fn(),
  resolveRecipePath: vi.fn(),
  writeRecipeFile: vi.fn(),
}));

import { runOpenClaw } from "@/lib/openclaw";
import { findRecipeById, parseFrontmatterId, resolveRecipePath, writeRecipeFile } from "@/lib/recipes";

const workspaceItem = {
  id: "my-recipe",
  name: "My Recipe",
  kind: "agent" as const,
  source: "workspace" as const,
};

const builtinItem = {
  id: "builtin-recipe",
  name: "Builtin",
  kind: "agent" as const,
  source: "builtin" as const,
};

describe("api recipes [id] route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(findRecipeById).mockReset();
    vi.mocked(resolveRecipePath).mockReset();
    vi.mocked(writeRecipeFile).mockReset();
    vi.mocked(parseFrontmatterId).mockReset();
  });

  describe("GET /api/recipes/[id]", () => {
    it("returns 404 when recipe not in list", async () => {
      vi.mocked(findRecipeById).mockResolvedValue(null);

      const res = await GET(new Request("https://test"), {
        params: Promise.resolve({ id: "missing" }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Recipe not found: missing");
    });

    it("returns recipe with content on success", async () => {
      vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
      vi.mocked(runOpenClaw).mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "# Recipe content",
        stderr: "",
      });
      vi.mocked(resolveRecipePath).mockResolvedValue("/mock/recipes/my-recipe.md");

      const res = await GET(new Request("https://test"), {
        params: Promise.resolve({ id: "my-recipe" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.recipe.id).toBe("my-recipe");
      expect(json.recipe.content).toBe("# Recipe content");
      expect(json.recipe.filePath).toBe("/mock/recipes/my-recipe.md");
    });

    it("returns filePath null when resolveRecipePath rejects", async () => {
      vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
      vi.mocked(runOpenClaw).mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "# Content",
        stderr: "",
      });
      vi.mocked(resolveRecipePath).mockRejectedValue(new Error("no path"));

      const res = await GET(new Request("https://test"), {
        params: Promise.resolve({ id: "my-recipe" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.recipe.filePath).toBeNull();
    });
  });

  describe("PUT /api/recipes/[id]", () => {
    it("returns 400 when content missing", async () => {
      const res = await PUT(
        new Request("https://test", { method: "PUT", body: JSON.stringify({}) }),
        { params: Promise.resolve({ id: "my-recipe" }) }
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing content");
    });

    it("returns 400 when frontmatter id mismatch", async () => {
      vi.mocked(parseFrontmatterId).mockReturnValue("other-id");
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ content: "---\nid: other-id\n---\nbody" }),
        }),
        { params: Promise.resolve({ id: "my-recipe" }) }
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Frontmatter id (other-id) must match URL id (my-recipe)");
    });

    it("returns 404 when recipe not found", async () => {
      vi.mocked(parseFrontmatterId).mockReturnValue("my-recipe");
      vi.mocked(findRecipeById).mockResolvedValue(null);

      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ content: "---\nid: my-recipe\n---\nbody" }),
        }),
        { params: Promise.resolve({ id: "my-recipe" }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when builtin recipe", async () => {
      vi.mocked(parseFrontmatterId).mockReturnValue("builtin-recipe");
      vi.mocked(findRecipeById).mockResolvedValue(builtinItem);

      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ content: "---\nid: builtin-recipe\n---\nbody" }),
        }),
        { params: Promise.resolve({ id: "builtin-recipe" }) }
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("builtin and cannot be modified");
    });

    it("writes and returns ok on success", async () => {
      const content = "---\nid: my-recipe\n---\nBody text";
      vi.mocked(parseFrontmatterId).mockReturnValue("my-recipe");
      vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
      vi.mocked(resolveRecipePath).mockResolvedValue(path.join("/mock", "my-recipe.md"));
      vi.mocked(writeRecipeFile).mockResolvedValue(undefined);

      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ content }),
        }),
        { params: Promise.resolve({ id: "my-recipe" }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.filePath).toBe(path.join("/mock", "my-recipe.md"));
      expect(writeRecipeFile).toHaveBeenCalledWith(path.join("/mock", "my-recipe.md"), content);
    });
  });
});
