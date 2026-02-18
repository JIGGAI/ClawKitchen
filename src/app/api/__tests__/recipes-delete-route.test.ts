import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../recipes/delete/route";
import path from "node:path";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  findRecipeById: vi.fn(),
  resolveRecipePath: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: { stat: vi.fn(), rm: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import { findRecipeById, resolveRecipePath } from "@/lib/recipes";
import fs from "node:fs/promises";

const workspaceItem = {
  id: "my-agent",
  name: "My Agent",
  kind: "agent" as const,
  source: "workspace" as const,
};

const teamWorkspaceItem = {
  id: "my-team",
  name: "My Team",
  kind: "team" as const,
  source: "workspace" as const,
};

const builtinItem = {
  id: "builtin-recipe",
  name: "Builtin",
  kind: "agent" as const,
  source: "builtin" as const,
};

describe("api recipes delete route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(findRecipeById).mockReset();
    vi.mocked(resolveRecipePath).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(fs.rm).mockReset();
  });

  it("returns 400 when id missing", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id is required");
  });

  it("returns 404 when list fails or recipe not found", async () => {
    vi.mocked(findRecipeById).mockResolvedValue(null);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "x" }) })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recipe not found: x");
  });

  it("returns 404 when recipe not found", async () => {
    vi.mocked(findRecipeById).mockResolvedValue(null);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "missing" }) })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recipe not found: missing");
  });

  it("returns 403 when builtin", async () => {
    vi.mocked(findRecipeById).mockResolvedValue(builtinItem);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "builtin-recipe" }),
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("builtin and cannot be deleted");
  });

  it("returns 500 when workspace not set", async () => {
    vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
    vi.mocked(runOpenClaw).mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-agent" }) })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("agents.defaults.workspace not set");
  });

  it("returns 403 when path outside workspace", async () => {
    const wsRoot = "/mock-workspace";
    vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
    vi.mocked(runOpenClaw).mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: wsRoot,
      stderr: "",
    });
    vi.mocked(resolveRecipePath).mockResolvedValue("/outside/path/recipe.md");

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-agent" }) })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Refusing to delete non-workspace recipe path");
  });

  it("returns 409 when team has workspace", async () => {
    const wsRoot = "/mock-workspace";
    vi.mocked(findRecipeById).mockResolvedValue(teamWorkspaceItem);
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: wsRoot,
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([]),
        stderr: "",
      });
    vi.mocked(resolveRecipePath).mockResolvedValue(
      path.join(wsRoot, "recipes", "my-team.md")
    );
    vi.mocked(fs.stat).mockResolvedValue({} as never);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-team" }) })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Team appears installed");
    expect(json.details.hasWorkspace).toBe(true);
  });

  it("returns 409 when team has agents", async () => {
    const wsRoot = "/mock-workspace";
    vi.mocked(findRecipeById).mockResolvedValue(teamWorkspaceItem);
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: wsRoot,
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "my-team-lead" }]),
        stderr: "",
      });
    vi.mocked(resolveRecipePath).mockResolvedValue(
      path.join(wsRoot, "recipes", "my-team.md")
    );
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-team" }) })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.details.hasAgents).toBe(true);
  });

  it("deletes and returns ok for agent recipe", async () => {
    const wsRoot = "/mock-workspace";
    const filePath = path.join(wsRoot, "recipes", "my-agent.md");
    vi.mocked(findRecipeById).mockResolvedValue(workspaceItem);
    vi.mocked(runOpenClaw).mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: wsRoot,
      stderr: "",
    });
    vi.mocked(resolveRecipePath).mockResolvedValue(filePath);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-agent" }) })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(path.resolve(filePath));
    expect(fs.rm).toHaveBeenCalledWith(path.resolve(filePath), { force: true });
  });

  it("deletes team recipe when not installed", async () => {
    const wsRoot = "/mock-workspace";
    const filePath = path.join(wsRoot, "recipes", "my-team.md");
    vi.mocked(findRecipeById).mockResolvedValue(teamWorkspaceItem);
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: wsRoot,
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "other-agent" }]),
        stderr: "",
      });
    vi.mocked(resolveRecipePath).mockResolvedValue(filePath);
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "my-team" }) })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
