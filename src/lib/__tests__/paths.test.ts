import { describe, expect, it, vi, beforeEach } from "vitest";
import * as path from "node:path";
import fs from "node:fs/promises";
import {
  readOpenClawConfig,
  getWorkspaceDir,
  getWorkspaceRecipesDir,
  getWorkspaceGoalsDir,
  getTeamWorkspaceDir,
  getBuiltinRecipesDir,
  teamDirFromBaseWorkspace,
  assertSafeRelativeFileName,
} from "../paths";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

describe("paths", () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
  });

  describe("readOpenClawConfig", () => {
    it("parses config from ~/.openclaw/openclaw.json", async () => {
      const config = {
        agents: { defaults: { workspace: "/home/user/workspace" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));

      const result = await readOpenClawConfig();
      expect(result).toEqual(config);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(process.env.HOME || "", ".openclaw", "openclaw.json"),
        "utf8"
      );
    });
  });

  describe("getWorkspaceDir", () => {
    it("returns workspace from config", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ agents: { defaults: { workspace: "/my/ws" } } })
      );
      expect(await getWorkspaceDir()).toBe("/my/ws");
    });

    it("throws when workspace not set", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
      await expect(getWorkspaceDir()).rejects.toThrow(
        "agents.defaults.workspace is not set"
      );
    });
  });

  describe("getWorkspaceRecipesDir", () => {
    it("joins workspace with recipes", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ agents: { defaults: { workspace: "/ws" } } })
      );
      expect(await getWorkspaceRecipesDir()).toBe("/ws/recipes");
    });
  });

  describe("getWorkspaceGoalsDir", () => {
    it("joins workspace with notes/goals", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ agents: { defaults: { workspace: "/ws" } } })
      );
      expect(await getWorkspaceGoalsDir()).toBe("/ws/notes/goals");
    });
  });

  describe("getTeamWorkspaceDir", () => {
    it("returns path for team workspace", async () => {
      const home = process.env.HOME || "/home/user";
      expect(await getTeamWorkspaceDir("my-team")).toBe(
        path.join(home, ".openclaw", "workspace-my-team")
      );
    });
  });

  describe("teamDirFromBaseWorkspace", () => {
    it("resolves team dir as sibling of base workspace", () => {
      expect(teamDirFromBaseWorkspace("/home/x/.openclaw/agents", "my-team")).toBe(
        path.join("/home/x/.openclaw", "workspace-my-team")
      );
    });
  });

  describe("assertSafeRelativeFileName", () => {
    it("returns name when safe", () => {
      expect(assertSafeRelativeFileName("TEAM.md")).toBe("TEAM.md");
    });
    it("throws on path traversal", () => {
      expect(() => assertSafeRelativeFileName("../etc/passwd")).toThrow("Invalid file name");
    });
    it("throws on empty or leading slash", () => {
      expect(() => assertSafeRelativeFileName("")).toThrow("Invalid file name");
      expect(() => assertSafeRelativeFileName("/absolute")).toThrow("Invalid file name");
    });
  });

  describe("getBuiltinRecipesDir", () => {
    it("uses installPath when set", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          plugins: {
            installs: { recipes: { installPath: "/plugins/claw" } },
          },
        })
      );
      expect(await getBuiltinRecipesDir()).toBe("/plugins/claw/recipes/default");
    });

    it("uses sourcePath when installPath not set", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          plugins: {
            installs: { recipes: { sourcePath: "/src/claw" } },
          },
        })
      );
      expect(await getBuiltinRecipesDir()).toBe("/src/claw/recipes/default");
    });

    it("throws when no recipe path configured", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
      await expect(getBuiltinRecipesDir()).rejects.toThrow(
        "Could not determine recipes plugin install path"
      );
    });
  });
});
