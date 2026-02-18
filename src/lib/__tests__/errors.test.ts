import { describe, expect, it } from "vitest";
import { errorMessage } from "../errors";

describe("errorMessage", () => {
  it("returns message for Error instances", () => {
    expect(errorMessage(new Error("foo"))).toBe("foo");
  });

  it("returns string for non-Error values", () => {
    expect(errorMessage("bar")).toBe("bar");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
