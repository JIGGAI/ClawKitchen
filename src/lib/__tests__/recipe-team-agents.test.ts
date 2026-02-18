import { describe, expect, it } from "vitest";
import { splitRecipeFrontmatter, normalizeRole } from "../recipe-team-agents";

describe("recipe-team-agents", () => {
  describe("splitRecipeFrontmatter", () => {
    it("returns yamlText and rest", () => {
      const md = `---
kind: team
agents: []
---
# Body`;
      const { yamlText, rest } = splitRecipeFrontmatter(md);
      expect(yamlText).toContain("kind: team");
      expect(rest).toBe("# Body");
    });

    it("throws when not starting with ---", () => {
      expect(() => splitRecipeFrontmatter("no frontmatter")).toThrow(
        "Recipe markdown must start with YAML frontmatter (---)"
      );
    });

    it("throws when frontmatter not terminated", () => {
      expect(() => splitRecipeFrontmatter("---\nid: x")).toThrow(
        "Recipe frontmatter not terminated (---)"
      );
    });
  });

  describe("normalizeRole", () => {
    it("returns trimmed role", () => {
      expect(normalizeRole("  lead  ")).toBe("lead");
    });

    it("throws when empty", () => {
      expect(() => normalizeRole("")).toThrow("role is required");
    });

    it("throws when invalid format", () => {
      expect(() => normalizeRole("bad!")).toThrow("role must be alphanumeric/dash");
    });

    it("accepts valid role", () => {
      expect(normalizeRole("qa-lead")).toBe("qa-lead");
    });
  });
});
