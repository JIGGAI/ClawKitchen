import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const execFileAsyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:util", () => {
  return {
    promisify: () => execFileAsyncMock,
  };
});

vi.mock("node:child_process", () => {
  return {
    execFile: vi.fn(),
  };
});

// Import after mocks so openclaw.ts binds our mocked execFileAsync.
import { runOpenClaw } from "../openclaw";

describe("openclaw (cron local exec)", () => {
  beforeEach(() => {
    execFileAsyncMock.mockReset();
  });

  afterEach(() => {
    delete (globalThis as unknown as { __clawkitchen_api?: unknown }).__clawkitchen_api;
  });

  it("runs cron commands via local exec and returns stdout/stderr", async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: "OUT", stderr: "ERR" });

    const res = await runOpenClaw(["cron", "list", "--json"]);
    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "openclaw",
      ["cron", "list", "--json"],
      expect.objectContaining({ timeout: 120000 })
    );

    expect(res).toEqual({ ok: true, exitCode: 0, stdout: "OUT", stderr: "ERR" });
  });

  it("returns ok=false when local exec rejects", async () => {
    execFileAsyncMock.mockRejectedValue({ code: 7, stdout: "so", stderr: "se" });

    const res = await runOpenClaw(["cron", "jobs"]);
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(7);
    expect(res.stdout).toBe("so");
    expect(res.stderr).toBe("se");
  });
});
