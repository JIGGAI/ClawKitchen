import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  findRecipeById,
  forceFrontmatterId,
  listRecipes,
  parseFrontmatterId,
  resolveRecipePath,
  readRecipe,
  writeRecipeFile,
  type RecipeListItem,
} from "../recipes";

vi.mock("../openclaw", () => ({ runOpenClaw: vi.fn() }));

vi.mock("../paths", () => ({
  getBuiltinRecipesDir: vi.fn(),
  getWorkspaceRecipesDir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import path from "node:path";
import fs from "node:fs/promises";
import { runOpenClaw } from "../openclaw";
import { getBuiltinRecipesDir, getWorkspaceRecipesDir } from "../paths";

describe("recipes", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(getBuiltinRecipesDir).mockReset();
    vi.mocked(getWorkspaceRecipesDir).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  describe("listRecipes", () => {
    it("returns parsed list when openclaw succeeds", async () => {
      const items: RecipeListItem[] = [
        { id: "r1", name: "R1", kind: "agent", source: "workspace" },
      ];
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify(items),
        stderr: "",
      });
      expect(await listRecipes()).toEqual(items);
    });

    it("returns empty array when openclaw fails", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "err" });
      expect(await listRecipes()).toEqual([]);
    });

    it("returns empty array when stdout is invalid JSON", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "not json", stderr: "" });
      expect(await listRecipes()).toEqual([]);
    });
  });

  describe("findRecipeById", () => {
    it("returns item when found", async () => {
      const item: RecipeListItem = { id: "x", name: "X", kind: "agent", source: "workspace" };
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([item]),
        stderr: "",
      });
      expect(await findRecipeById("x")).toEqual(item);
    });

    it("returns null when not found", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([]),
        stderr: "",
      });
      expect(await findRecipeById("missing")).toBeNull();
    });
  });

  describe("forceFrontmatterId", () => {
    it("replaces existing id in frontmatter", () => {
      const md = "---\nid: old\nname: Foo\n---\nBody";
      expect(forceFrontmatterId(md, "new-id")).toContain("id: new-id");
      expect(forceFrontmatterId(md, "new-id")).toContain("Body");
    });

    it("adds id when missing", () => {
      const md = "---\nname: Foo\n---\nBody";
      const out = forceFrontmatterId(md, "added");
      expect(out).toMatch(/id:\s*added/);
    });

    it("returns md unchanged when no frontmatter", () => {
      const md = "No frontmatter";
      expect(forceFrontmatterId(md, "x")).toBe(md);
    });
  });

  describe("parseFrontmatterId", () => {
    it("returns id from valid frontmatter", () => {
      const md = `---
id: my-recipe
name: My Recipe
---
# Content`;
      expect(parseFrontmatterId(md)).toBe("my-recipe");
    });

    it("throws when markdown does not start with ---", () => {
      expect(() => parseFrontmatterId("no frontmatter")).toThrow(
        "Recipe markdown must start with YAML frontmatter (---)"
      );
    });

    it("throws when frontmatter not terminated", () => {
      const md = `---
id: x`;
      expect(() => parseFrontmatterId(md)).toThrow("Recipe frontmatter not terminated (---)");
    });

    it("throws when id is missing", () => {
      const md = `---
name: Foo
---
# Content`;
      expect(() => parseFrontmatterId(md)).toThrow("Recipe frontmatter must include id");
    });

    it("handles id with extra fields", () => {
      const md = `---
id: agent-recipe
kind: agent
---
# Body`;
      expect(parseFrontmatterId(md)).toBe("agent-recipe");
    });
  });

  describe("resolveRecipePath", () => {
    it("returns builtin path for builtin source", async () => {
      vi.mocked(getBuiltinRecipesDir).mockResolvedValue("/builtin/recipes");
      const item: RecipeListItem = { id: "foo", name: "Foo", kind: "agent", source: "builtin" };
      const p = await resolveRecipePath(item);
      expect(p).toBe(path.join("/builtin/recipes", "foo.md"));
      expect(getBuiltinRecipesDir).toHaveBeenCalledOnce();
    });

    it("returns workspace path for workspace source", async () => {
      vi.mocked(getWorkspaceRecipesDir).mockResolvedValue("/ws/recipes");
      const item: RecipeListItem = { id: "bar", name: "Bar", kind: "team", source: "workspace" };
      const p = await resolveRecipePath(item);
      expect(p).toBe(path.join("/ws/recipes", "bar.md"));
      expect(getWorkspaceRecipesDir).toHaveBeenCalledOnce();
    });
  });

  describe("readRecipe", () => {
    it("returns detail with filePath when resolve succeeds", async () => {
      vi.mocked(getWorkspaceRecipesDir).mockResolvedValue("/ws/recipes");
      const item: RecipeListItem = { id: "r1", name: "R1", kind: "agent", source: "workspace" };
      const content = "# Recipe content";
      const result = await readRecipe(item, content);
      expect(result).toEqual({
        ...item,
        content,
        filePath: path.join("/ws/recipes", "r1.md"),
      });
    });

    it("returns filePath null when resolve throws", async () => {
      vi.mocked(getWorkspaceRecipesDir).mockRejectedValue(new Error("no config"));
      const item: RecipeListItem = { id: "r2", name: "R2", kind: "team", source: "workspace" };
      const result = await readRecipe(item, "body");
      expect(result.content).toBe("body");
      expect(result.filePath).toBeNull();
    });
  });

  describe("writeRecipeFile", () => {
    it("creates dir and writes file", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeRecipeFile("/some/dir/recipe.md", "# Markdown");

      expect(fs.mkdir).toHaveBeenCalledWith("/some/dir", { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith("/some/dir/recipe.md", "# Markdown", "utf8");
    });
  });
});
