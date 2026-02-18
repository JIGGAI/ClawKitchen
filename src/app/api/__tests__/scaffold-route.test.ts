import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../scaffold/route";
import path from "node:path";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  default: { mkdir: vi.fn(), writeFile: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import { readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api scaffold route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  it("returns ok on agent scaffold success", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "Done",
      stderr: "",
    });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ kind: "agent", recipeId: "my-agent" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.args).toEqual(["recipes", "scaffold", "my-agent"]);
    expect(runOpenClaw).toHaveBeenCalledWith(["recipes", "scaffold", "my-agent"]);
  });

  it("returns ok on team scaffold success", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "Done",
      stderr: "",
    });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          kind: "team",
          recipeId: "my-team",
          teamId: "my-team",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.args).toContain("scaffold-team");
    expect(json.args).toContain("--team-id");
  });

  it("returns 500 when runOpenClaw throws", async () => {
    vi.mocked(runOpenClaw).mockRejectedValue(new Error("Command failed"));

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ kind: "agent", recipeId: "my-agent" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Command failed");
  });

  it("applies cron override when cronInstallChoice yes", async () => {
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "off", stderr: "" })
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "Done", stderr: "" })
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          kind: "agent",
          recipeId: "my-agent",
          cronInstallChoice: "yes",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(runOpenClaw).toHaveBeenCalledTimes(4);
    expect(runOpenClaw).toHaveBeenNthCalledWith(1, ["config", "get", expect.any(String)]);
    expect(runOpenClaw).toHaveBeenNthCalledWith(2, ["config", "set", expect.any(String), "on"]);
    expect(runOpenClaw).toHaveBeenNthCalledWith(4, ["config", "set", expect.any(String), "off"]);
  });

  it("persists team provenance on team scaffold", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "Done",
      stderr: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({
      agents: { defaults: { workspace: "/mock-workspace" } },
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          kind: "team",
          recipeId: "my-team",
          teamId: "my-team",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(fs.mkdir).toHaveBeenCalledWith(
      path.resolve("/mock-workspace", "..", "workspace-my-team"),
      { recursive: true }
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join(path.resolve("/mock-workspace", "..", "workspace-my-team"), "team.json"),
      expect.stringContaining("my-team"),
      "utf8"
    );
  });

  it("attempts cron restore in finally when scaffold throws after override", async () => {
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "off", stderr: "" })
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("Scaffold failed"))
      .mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          kind: "agent",
          recipeId: "my-agent",
          cronInstallChoice: "yes",
        }),
      })
    );
    expect(res.status).toBe(500);
    expect(runOpenClaw).toHaveBeenCalledTimes(4);
    expect(runOpenClaw).toHaveBeenNthCalledWith(4, [
      "config",
      "set",
      expect.any(String),
      "off",
    ]);
  });
});
