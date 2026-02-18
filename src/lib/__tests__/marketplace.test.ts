import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadRegistry, search, getBySlug, type MarketplaceRecipe } from "../marketplace";

vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn() },
}));

import fs from "node:fs/promises";

describe("marketplace", () => {
  const sampleRecipes: MarketplaceRecipe[] = [
    {
      slug: "my-agent",
      kind: "agent",
      name: "My Agent",
      description: "Does stuff with AI",
      version: "1.0.0",
      tags: ["agent", "ai"],
      sourceUrl: "https://example.com/repo",
    },
    {
      slug: "team-template",
      kind: "team",
      name: "Team Template",
      description: "Multi-agent collaboration",
      version: "0.1.0",
      tags: ["team", "collab"],
      sourceUrl: "https://example.com/team",
    },
  ];

  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
  });

  describe("loadRegistry", () => {
    it("returns parsed registry when valid", async () => {
      const reg = {
        version: 1,
        generatedAt: "2025-01-01T00:00:00Z",
        recipes: sampleRecipes,
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(reg));

      const result = await loadRegistry();
      expect(result.version).toBe(1);
      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0].slug).toBe("my-agent");
    });

    it("throws when registry is invalid (no recipes array)", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1 }));

      await expect(loadRegistry()).rejects.toThrow("Invalid marketplace registry.json");
    });

    it("throws when recipes is not array", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1, recipes: "bad" }));

      await expect(loadRegistry()).rejects.toThrow("Invalid marketplace registry.json");
    });
  });

  describe("search", () => {
    it("returns all when query is null or empty", () => {
      expect(search(sampleRecipes, null)).toEqual(sampleRecipes);
      expect(search(sampleRecipes, "")).toEqual(sampleRecipes);
      expect(search(sampleRecipes, "   ")).toEqual(sampleRecipes);
    });

    it("filters by name match", () => {
      const r = search(sampleRecipes, "template");
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe("Team Template");
    });

    it("filters by slug match", () => {
      const r = search(sampleRecipes, "team-template");
      expect(r).toHaveLength(1);
      expect(r[0].slug).toBe("team-template");
    });

    it("filters by description", () => {
      const r = search(sampleRecipes, "collaboration");
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe("Team Template");
    });

    it("is case insensitive", () => {
      const r = search(sampleRecipes, "COLLAB");
      expect(r).toHaveLength(1);
    });
  });

  describe("getBySlug", () => {
    it("returns recipe when slug matches", () => {
      const r = getBySlug(sampleRecipes, "my-agent");
      expect(r).not.toBeNull();
      expect(r!.slug).toBe("my-agent");
    });

    it("returns null when slug not found", () => {
      expect(getBySlug(sampleRecipes, "nonexistent")).toBeNull();
    });

    it("is case insensitive", () => {
      const r = getBySlug(sampleRecipes, "MY-AGENT");
      expect(r?.slug).toBe("my-agent");
    });

    it("trims query", () => {
      const r = getBySlug(sampleRecipes, "  my-agent  ");
      expect(r?.slug).toBe("my-agent");
    });
  });
});
