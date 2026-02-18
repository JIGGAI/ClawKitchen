import { describe, expect, it } from "vitest";
import { slugifyId } from "../slugify";

describe("slugifyId", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyId("My Goal Title")).toBe("my-goal-title");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyId("  --foo--  ")).toBe("foo");
  });

  it("respects maxLength parameter", () => {
    const long = "a".repeat(100);
    expect(slugifyId(long, 64).length).toBe(64);
    expect(slugifyId(long, 80).length).toBe(80);
  });

  it("returns empty for empty input", () => {
    expect(slugifyId("")).toBe("");
    expect(slugifyId("   ")).toBe("");
  });
});
