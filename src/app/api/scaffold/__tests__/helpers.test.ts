import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  validateAgentId,
  validateTeamId,
  withCronOverride,
  persistTeamProvenance,
  persistAgentProvenance,
} from "../helpers";

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: vi.fn(),
}));
vi.mock("@/lib/paths", () => ({
  readOpenClawConfig: vi.fn(),
  getWorkspaceRecipesDir: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
}));

import { runOpenClaw } from "@/lib/openclaw";
import { readOpenClawConfig, getWorkspaceRecipesDir } from "@/lib/paths";
import fs from "node:fs/promises";

describe("scaffold helpers", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(getWorkspaceRecipesDir).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();
    vi.mocked(fs.readFile).mockReset();
  });

  describe("validateAgentId", () => {
    it("returns null when agentId empty", async () => {
      const result = await validateAgentId("", new Set(["recipe1"]));
      expect(result).toBeNull();
    });

    it("returns 409 when agentId matches recipe id", async () => {
      const result = await validateAgentId("my-recipe", new Set(["my-recipe"]));
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(409);
      const json = await (result as Response).json();
      expect(json.error).toContain("cannot match an existing recipe id");
    });

    it("returns null when agent does not exist", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([{ id: "other-agent" }]),
        stderr: "",
        exitCode: 0,
      });
      const result = await validateAgentId("new-agent", new Set());
      expect(result).toBeNull();
    });

    it("returns 409 when agent already exists", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([{ id: "existing-agent" }]),
        stderr: "",
        exitCode: 0,
      });
      const result = await validateAgentId("existing-agent", new Set());
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(409);
      const json = await (result as Response).json();
      expect(json.error).toContain("Agent already exists");
    });
  });

  describe("validateTeamId", () => {
    it("returns null when teamId empty", async () => {
      const result = await validateTeamId("", new Set());
      expect(result).toBeNull();
    });

    it("returns 409 when teamId matches recipe id", async () => {
      const result = await validateTeamId("my-recipe", new Set(["my-recipe"]));
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(409);
      const json = await (result as Response).json();
      expect(json.error).toContain("cannot match an existing recipe id");
    });

    it("returns 409 when team workspace exists", async () => {
      // Mock readOpenClawConfig to return a valid config
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        agents: { defaults: { workspace: "/home/.openclaw/workspace" } },
      } as never);
      
      // Mock fs.stat to simulate workspace exists (resolves successfully) 
      vi.mocked(fs.stat).mockResolvedValue({} as never);
      
      // Mock runOpenClaw for the agents list call (even though we won't reach it)
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([]),
        stderr: "",
        exitCode: 0,
      });
      
      const result = await validateTeamId("team1", new Set());
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(409);
      const json = await (result as Response).json();
      expect(json.error).toContain("Team workspace already exists");
    });

    it("returns null when team workspace does not exist and no agents", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        agents: { defaults: { workspace: "/home/.openclaw/workspace" } },
      } as never);
      vi.mocked(fs.stat).mockRejectedValue(new Error("not found"));
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([]),
        stderr: "",
        exitCode: 0,
      });
      const result = await validateTeamId("team1", new Set());
      expect(result).toBeNull();
    });
  });

  describe("withCronOverride", () => {
    it("runs fn without override when override undefined", async () => {
      const fn = vi.fn().mockResolvedValue(42);
      const result = await withCronOverride(undefined, fn);
      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(runOpenClaw).not.toHaveBeenCalled();
    });

    it("runs fn and restores config when override yes", async () => {
      vi.mocked(runOpenClaw)
        .mockResolvedValueOnce({ ok: true, stdout: "off", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "", exitCode: 0 });
      const fn = vi.fn().mockResolvedValue("done");
      const result = await withCronOverride("yes", fn);
      expect(result).toBe("done");
      expect(runOpenClaw).toHaveBeenCalledTimes(3); // get, set on, set restore
    });
  });

  describe("persistTeamProvenance", () => {
    it("writes team.json when workspace configured", async () => {
      // Set up all required mocks for the complete flow
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        agents: { defaults: { workspace: "/home/.openclaw/workspace" } },
      } as never);
      
      // Mock runOpenClaw for getRecipeName call (first call in persistProvenance)
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([{ id: "recipe1", name: "Recipe 1" }]),
        stderr: "",
        exitCode: 0,
      });
      
      // Mock getWorkspaceRecipesDir for the team.md update logic
      vi.mocked(getWorkspaceRecipesDir).mockResolvedValue("/workspace/recipes");
      
      // Mock fs.readFile for the team.md frontmatter update
      vi.mocked(fs.readFile).mockResolvedValue("---\nkind: team\n---\nbody");
      
      // Mock fs operations to resolve successfully
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      
      await persistTeamProvenance("team1", "recipe1", "abc123");
      
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Find the call that writes team.json (not the recipe file update)
      const writeFileArgs = vi.mocked(fs.writeFile).mock.calls;
      const teamJsonCall = writeFileArgs.find(call => call[0].includes("team.json"));
      expect(teamJsonCall).toBeTruthy();
      expect(teamJsonCall![1]).toContain("team1");
      expect(teamJsonCall![1]).toContain("recipe1");
    });
  });

  describe("persistAgentProvenance", () => {
    it("writes agent.json when workspace configured", async () => {
      // Set up all required mocks for the complete flow
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        agents: { defaults: { workspace: "/home/.openclaw/workspace" } },
      } as never);
      
      // Mock runOpenClaw for getRecipeName call
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        stdout: JSON.stringify([{ id: "recipe1", name: "Recipe 1" }]),
        stderr: "",
        exitCode: 0,
      });
      
      // Mock fs operations to resolve successfully
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      
      await persistAgentProvenance("agent1", "recipe1", null);
      
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[0]).toContain("agent.json");
      expect(writeCall[1]).toContain("agent1");
    });
  });
});