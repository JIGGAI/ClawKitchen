import { describe, expect, it } from "vitest";

import { parseCommaList } from "@/lib/goals-client";

describe("parseCommaList", () => {
  it("splits on commas and trims", () => {
    expect(parseCommaList("a, b,  c")).toEqual(["a", "b", "c"]);
  });

  it("drops empty values", () => {
    expect(parseCommaList("a,, ,b, ")).toEqual(["a", "b"]);
  });

  it("returns [] for empty string", () => {
    expect(parseCommaList(" ")).toEqual([]);
  });
});
