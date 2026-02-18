import { describe, expect, it } from "vitest";
import { execFileAsync } from "../exec";

describe("exec", () => {
  it("exports execFileAsync as a function", () => {
    expect(typeof execFileAsync).toBe("function");
  });

  it("invokes and returns stdout", async () => {
    const result = await execFileAsync("echo", ["hello"], { encoding: "utf8" });
    expect(result.stdout).toBe("hello\n");
  });
});
