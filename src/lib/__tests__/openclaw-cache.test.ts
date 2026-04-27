import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

vi.mock("../openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "../openclaw";
import {
  cachedRunOpenClaw,
  invalidateOpenClawCache,
  _resetOpenClawCache,
  __setDiskCacheConfigForTests,
} from "../openclaw-cache";

let tmpDir: string;

function diskPathForArgs(dir: string, args: string[]): string {
  const key = JSON.stringify(args);
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 40);
  return path.join(dir, `${hash}.json`);
}

function writeEntry(dir: string, args: string[], stdout: string, expiresAt: number): void {
  mkdirSync(dir, { recursive: true });
  const value = { ok: true, exitCode: 0, stdout, stderr: "" };
  writeFileSync(
    diskPathForArgs(dir, args),
    JSON.stringify({ args, expires: expiresAt, value }),
    "utf8",
  );
}

function readEntryStdout(dir: string, args: string[]): string | null {
  try {
    const parsed = JSON.parse(readFileSync(diskPathForArgs(dir, args), "utf8"));
    return parsed?.value?.stdout ?? null;
  } catch {
    return null;
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "openclaw-cache-test-"));
  __setDiskCacheConfigForTests({ enabled: true, dir: tmpDir });
  _resetOpenClawCache();
  vi.mocked(runOpenClaw).mockReset();
});

afterEach(() => {
  __setDiskCacheConfigForTests({ reset: true });
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe("cachedRunOpenClaw — stale-while-revalidate", () => {
  it("serves expired disk entry immediately and triggers a background refresh", async () => {
    writeEntry(tmpDir, ["recipes", "list"], "stale-data", Date.now() - 1000);
    let resolveSubprocess: (v: { ok: true; exitCode: 0; stdout: string; stderr: string }) => void = () => {};
    vi.mocked(runOpenClaw).mockReturnValue(
      new Promise((r) => {
        resolveSubprocess = r;
      }),
    );

    const first = await cachedRunOpenClaw(["recipes", "list"]);
    expect(first.stdout).toBe("stale-data");
    expect(vi.mocked(runOpenClaw)).toHaveBeenCalledTimes(1);

    resolveSubprocess({ ok: true, exitCode: 0, stdout: "fresh-data", stderr: "" });
    // Yield so the background IIFE can write fresh value to memory + disk.
    await new Promise((r) => setTimeout(r, 5));

    const second = await cachedRunOpenClaw(["recipes", "list"]);
    expect(second.stdout).toBe("fresh-data");
    expect(vi.mocked(runOpenClaw)).toHaveBeenCalledTimes(1);
    expect(readEntryStdout(tmpDir, ["recipes", "list"])).toBe("fresh-data");
  });

  it("returns fresh disk entry without triggering a subprocess", async () => {
    writeEntry(tmpDir, ["recipes", "list"], "fresh-data", Date.now() + 60_000);

    const got = await cachedRunOpenClaw(["recipes", "list"]);
    expect(got.stdout).toBe("fresh-data");
    expect(vi.mocked(runOpenClaw)).not.toHaveBeenCalled();
  });

  it("falls through to subprocess on full disk miss", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "subprocess-data",
      stderr: "",
    });

    const got = await cachedRunOpenClaw(["recipes", "list"]);
    expect(got.stdout).toBe("subprocess-data");
    expect(vi.mocked(runOpenClaw)).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent stale reads into a single background subprocess", async () => {
    writeEntry(tmpDir, ["recipes", "list"], "stale-data", Date.now() - 1000);
    let resolveSubprocess: (v: { ok: true; exitCode: 0; stdout: string; stderr: string }) => void = () => {};
    vi.mocked(runOpenClaw).mockReturnValue(
      new Promise((r) => {
        resolveSubprocess = r;
      }),
    );

    const [a, b, c] = await Promise.all([
      cachedRunOpenClaw(["recipes", "list"]),
      cachedRunOpenClaw(["recipes", "list"]),
      cachedRunOpenClaw(["recipes", "list"]),
    ]);

    expect(a.stdout).toBe("stale-data");
    expect(b.stdout).toBe("stale-data");
    expect(c.stdout).toBe("stale-data");
    expect(vi.mocked(runOpenClaw)).toHaveBeenCalledTimes(1);

    resolveSubprocess({ ok: true, exitCode: 0, stdout: "fresh-data", stderr: "" });
  });

  it("does not write a fresh value when the background refresh fails", async () => {
    writeEntry(tmpDir, ["recipes", "list"], "stale-data", Date.now() - 1000);
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "boom",
    });

    const first = await cachedRunOpenClaw(["recipes", "list"]);
    expect(first.stdout).toBe("stale-data");
    await new Promise((r) => setTimeout(r, 5));

    // Stale disk entry untouched on failed refresh.
    expect(readEntryStdout(tmpDir, ["recipes", "list"])).toBe("stale-data");
  });

  it("invalidate clears expired entries so SWR no longer serves stale", async () => {
    writeEntry(tmpDir, ["recipes", "list"], "stale-data", Date.now() - 1000);
    invalidateOpenClawCache(["recipes", "list"]);

    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "subprocess-data",
      stderr: "",
    });

    const got = await cachedRunOpenClaw(["recipes", "list"]);
    expect(got.stdout).toBe("subprocess-data");
    expect(vi.mocked(runOpenClaw)).toHaveBeenCalledTimes(1);
  });
});
