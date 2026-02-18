import { describe, expect, it, vi, beforeEach } from "vitest";
import { runOpenClaw } from "../openclaw";

const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock("../exec", () => ({
  execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args),
}));

describe("openclaw", () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  describe("runOpenClaw", () => {
    it("returns ok true when exit is 0", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: Buffer.from("stdout\n"),
        stderr: Buffer.from("stderr"),
      });

      const result = await runOpenClaw(["recipes", "list"]);
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("stdout\n");
      expect(result.stderr).toBe("stderr");
    });

    it("returns ok false with stdout/stderr on non-zero exit", async () => {
      const err = new Error("Command failed") as Error & { code?: number; stdout?: Buffer; stderr?: Buffer };
      err.code = 1;
      err.stdout = Buffer.from("out");
      err.stderr = Buffer.from("err");

      mockExecFileAsync.mockRejectedValue(err);

      const result = await runOpenClaw(["bad", "cmd"]);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("out");
      expect(result.stderr).toBe("err");
    });

    it("uses err.message as stderr fallback when stderr missing", async () => {
      const err = new Error("Something went wrong") as Error & { code?: number };
      err.code = 2;

      mockExecFileAsync.mockRejectedValue(err);

      const result = await runOpenClaw(["fail"]);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe("Something went wrong");
    });

    it("uses numeric code from error", async () => {
      const err = new Error("fail") as Error & { code?: number };
      err.code = 42;

      mockExecFileAsync.mockRejectedValue(err);

      const result = await runOpenClaw(["x"]);
      expect(result.exitCode).toBe(42);
    });

    it("defaults exitCode to 1 when code not numeric", async () => {
      const err = new Error("fail");

      mockExecFileAsync.mockRejectedValue(err);

      const result = await runOpenClaw(["x"]);
      expect(result.exitCode).toBe(1);
    });
  });
});
