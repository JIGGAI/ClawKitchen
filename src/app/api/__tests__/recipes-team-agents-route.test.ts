import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../recipes/team-agents/route";
import path from "node:path";

vi.mock("@/lib/paths", () => ({ getWorkspaceRecipesDir: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn() },
}));

import { getWorkspaceRecipesDir } from "@/lib/paths";
import fs from "node:fs/promises";

const teamRecipeMd = `---
kind: team
agents:
  - role: lead
    name: Lead
---
# Team body`;

describe("api recipes team-agents route", () => {
  const dir = "/mock-workspace/recipes";

  beforeEach(() => {
    vi.mocked(getWorkspaceRecipesDir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset();

    vi.mocked(getWorkspaceRecipesDir).mockResolvedValue(dir);
    vi.mocked(fs.readFile).mockResolvedValue(teamRecipeMd);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it("returns 400 when recipeId missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ op: "add", role: "qa" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("recipeId is required");
  });

  it("returns 400 when op invalid", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ recipeId: "my-team", op: "invalid", role: "qa" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("op must be add|remove");
  });

  it("throws when role invalid", async () => {
    await expect(
      POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ recipeId: "my-team", op: "add", role: "" }),
        })
      )
    ).rejects.toThrow("role is required");
  });

  it("returns 400 when kind is not team", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(`---
kind: agent
---
# Body`);

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ recipeId: "agent-recipe", op: "add", role: "qa" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("kind must be team");
  });

  it("adds agent and returns ok", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          recipeId: "my-team",
          op: "add",
          role: "qa",
          name: "QA",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.recipeId).toBe("my-team");
    expect(json.agents).toContainEqual(expect.objectContaining({ role: "qa", name: "QA" }));
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join(dir, "my-team.md"),
      expect.stringContaining("role: qa"),
      "utf8"
    );
  });

  it("removes agent", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ recipeId: "my-team", op: "remove", role: "lead" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agents).not.toContainEqual(expect.objectContaining({ role: "lead" }));
  });

  it("throws when fs.readFile fails", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    await expect(
      POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ recipeId: "missing", op: "add", role: "qa" }),
        })
      )
    ).rejects.toThrow();
  });
});
