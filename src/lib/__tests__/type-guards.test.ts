import { describe, expect, it } from "vitest";
import { isRecord } from "../type-guards";

describe("type-guards", () => {
  describe("isRecord", () => {
    it("returns true for plain objects", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });
    it("returns false for arrays and primitives", () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord("x")).toBe(false);
      expect(isRecord(1)).toBe(false);
    });
  });
});
