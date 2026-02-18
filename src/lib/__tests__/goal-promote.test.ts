import { describe, expect, it } from "vitest";
import { slugifyFilePart, ensureWorkflowInstructions } from "../goal-promote";

describe("goal-promote", () => {
  describe("slugifyFilePart", () => {
    it("lowercases and hyphenates", () => {
      expect(slugifyFilePart("My Goal Title")).toBe("my-goal-title");
    });

    it("strips leading and trailing hyphens", () => {
      expect(slugifyFilePart("  --foo--  ")).toBe("foo");
    });

    it("truncates to 80 chars", () => {
      const long = "a".repeat(100);
      expect(slugifyFilePart(long).length).toBe(80);
    });

    it("handles empty input", () => {
      expect(slugifyFilePart("")).toBe("");
    });
  });

  describe("ensureWorkflowInstructions", () => {
    it("returns body unchanged when marker present", () => {
      const body = "Content\n<!-- goal-workflow -->\nMore";
      expect(ensureWorkflowInstructions(body)).toBe(body);
    });

    it("appends workflow snippet when marker missing", () => {
      const body = "## Existing";
      const result = ensureWorkflowInstructions(body);
      expect(result).toContain("## Existing");
      expect(result).toContain("## Workflow");
      expect(result).toContain("<!-- goal-workflow -->");
      expect(result).toContain("Promote to inbox");
    });
  });
});
