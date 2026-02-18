import { describe, expect, it } from "vitest";
import { safeJsonParse } from "../json";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse("[1,2]")).toEqual([1, 2]);
    expect(safeJsonParse('"hi"')).toBe("hi");
  });

  it("returns null for invalid JSON", () => {
    expect(safeJsonParse("not json")).toBeNull();
    expect(safeJsonParse("{")).toBeNull();
  });
});
