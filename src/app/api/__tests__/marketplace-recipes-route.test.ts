import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../marketplace/recipes/route";
import { GET as GET_SLUG } from "../marketplace/recipes/[slug]/route";

vi.mock("@/lib/marketplace", () => ({
  loadRegistry: vi.fn(),
  search: vi.fn(),
  getBySlug: vi.fn(),
}));

import { loadRegistry, search, getBySlug } from "@/lib/marketplace";

const sampleRecipe = {
  slug: "my-agent",
  kind: "agent" as const,
  name: "My Agent",
  description: "Does stuff",
  version: "1.0.0",
  tags: ["agent"],
  sourceUrl: "https://example.com",
};

describe("api marketplace recipes route", () => {
  beforeEach(() => {
    vi.mocked(loadRegistry).mockReset();
    vi.mocked(search).mockReset();
    vi.mocked(getBySlug).mockReset();
  });

  describe("GET /api/marketplace/recipes", () => {
    it("returns recipes on success without query", async () => {
      vi.mocked(loadRegistry).mockResolvedValue({
        version: 1,
        generatedAt: "2025-01-01",
        recipes: [sampleRecipe],
      });
      vi.mocked(search).mockImplementation((recipes) => recipes);

      const res = await GET(new Request("https://test/api/marketplace/recipes"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.recipes).toHaveLength(1);
      expect(json.recipes[0].slug).toBe("my-agent");
      expect(search).toHaveBeenCalledWith([sampleRecipe], null);
    });

    it("returns filtered recipes when query provided", async () => {
      vi.mocked(loadRegistry).mockResolvedValue({
        version: 1,
        generatedAt: "2025-01-01",
        recipes: [sampleRecipe],
      });
      vi.mocked(search).mockReturnValue([sampleRecipe]);

      const res = await GET(new Request("https://test/api/marketplace/recipes?q=agent"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(search).toHaveBeenCalledWith([sampleRecipe], "agent");
    });

    it("returns 500 when loadRegistry throws", async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error("Registry error"));

      const res = await GET(new Request("https://test/api/marketplace/recipes"));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("Registry error");
    });
  });

  describe("GET /api/marketplace/recipes/[slug]", () => {
    it("returns recipe when found", async () => {
      vi.mocked(loadRegistry).mockResolvedValue({
        version: 1,
        generatedAt: "2025-01-01",
        recipes: [sampleRecipe],
      });
      vi.mocked(getBySlug).mockReturnValue(sampleRecipe);

      const res = await GET_SLUG(
        new Request("https://test"),
        { params: Promise.resolve({ slug: "my-agent" }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.recipe.slug).toBe("my-agent");
    });

    it("returns 404 when not found", async () => {
      vi.mocked(loadRegistry).mockResolvedValue({
        version: 1,
        generatedAt: "2025-01-01",
        recipes: [],
      });
      vi.mocked(getBySlug).mockReturnValue(null);

      const res = await GET_SLUG(
        new Request("https://test"),
        { params: Promise.resolve({ slug: "missing" }) }
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("Not found");
    });

    it("returns 500 when loadRegistry throws", async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error("Load failed"));

      const res = await GET_SLUG(
        new Request("https://test"),
        { params: Promise.resolve({ slug: "any" }) }
      );
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Load failed");
    });
  });
});
