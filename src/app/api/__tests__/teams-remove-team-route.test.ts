import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../teams/remove-team/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "@/lib/openclaw";

describe("api teams remove-team route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
  });

  it("returns 400 when teamId missing", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 403 when team is builtin", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([
        { id: "builtin-team", kind: "team", source: "builtin" },
      ]),
      stderr: "",
    });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ teamId: "builtin-team" }),
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Refusing to delete builtin team");
  });

  it("returns 500 when runOpenClaw fails", async () => {
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "my-team", kind: "team", source: "workspace" }]),
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "Team in use",
      });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ teamId: "my-team" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Team in use");
  });

  it("returns ok on success", async () => {
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "my-team", kind: "team", source: "workspace" }]),
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify({ removed: true }),
        stderr: "",
      });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ teamId: "my-team" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result).toEqual({ removed: true });
  });

  it("includes includeAmbiguous when specified", async () => {
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "t", kind: "team", source: "workspace" }]),
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "{}",
        stderr: "",
      });

    await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ teamId: "t", includeAmbiguous: true }),
      })
    );
    expect(runOpenClaw).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(["--include-ambiguous"])
    );
  });
});
