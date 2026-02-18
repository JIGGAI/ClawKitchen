import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../recipes/clone/route";
import path from "node:path";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/paths", () => ({ getWorkspaceRecipesDir: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: { stat: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() },
}));

import { runOpenClaw } from "@/lib/openclaw";
import { getWorkspaceRecipesDir } from "@/lib/paths";
import fs from "node:fs/promises";

const sampleRecipe = `---
id: source-agent
kind: agent
name: Source Agent
---
# Content`;

describe("api recipes clone route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(getWorkspaceRecipesDir).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  it("returns 400 when fromId missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ toId: "target" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing fromId");
  });

  it("returns 400 when toId missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ fromId: "source" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing toId");
  });

  it("returns 400 when recipes show fails", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "Not found",
    });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ fromId: "source", toId: "target" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Not found");
  });

  it("clones and returns ok for agent", async () => {
    const dir = "/mock-workspace/recipes";
    vi.mocked(runOpenClaw).mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: sampleRecipe,
      stderr: "",
    });
    vi.mocked(getWorkspaceRecipesDir).mockResolvedValue(dir);
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ fromId: "source-agent", toId: "my-agent" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.recipeId).toBe("my-agent");
    expect(json.filePath).toBe(path.join(dir, "my-agent.md"));
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join(dir, "my-agent.md"),
      expect.stringContaining("id: my-agent"),
      "utf8"
    );
  });

  it("returns 409 when target exists and overwrite false", async () => {
    const dir = "/mock-workspace/recipes";
    vi.mocked(runOpenClaw).mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: sampleRecipe,
      stderr: "",
    });
    vi.mocked(getWorkspaceRecipesDir).mockResolvedValue(dir);
    vi.mocked(fs.stat).mockResolvedValue({} as never);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ fromId: "source-agent", toId: "existing" }),
      })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already exists");
    expect(json.code).toBe("RECIPE_ID_TAKEN");
    expect(json.suggestions).toContain("custom-existing");
  });

  it("scaffolds when scaffold true for agent", async () => {
    const dir = "/mock-workspace/recipes";
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: sampleRecipe,
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
      });
    vi.mocked(getWorkspaceRecipesDir).mockResolvedValue(dir);
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          fromId: "source-agent",
          toId: "my-agent",
          scaffold: true,
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scaffold?.ok).toBe(true);
    expect(runOpenClaw).toHaveBeenCalledTimes(2);
    expect(runOpenClaw).toHaveBeenNthCalledWith(2, [
      "recipes",
      "scaffold",
      "my-agent",
      "--agent-id",
      "my-agent",
      "--overwrite",
    ]);
  });

  it("scaffolds team when kind is team", async () => {
    const teamRecipe = `---
id: source-team
kind: team
name: Source Team
---
# Team body`;
    const dir = "/mock-workspace/recipes";
    vi.mocked(runOpenClaw)
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: teamRecipe,
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
      });
    vi.mocked(getWorkspaceRecipesDir).mockResolvedValue(dir);
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          fromId: "source-team",
          toId: "my-team",
          scaffold: true,
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(runOpenClaw).toHaveBeenNthCalledWith(2, [
      "recipes",
      "scaffold-team",
      "my-team",
      "--team-id",
      "my-team",
      "--overwrite",
    ]);
  });
});
