import { describe, expect, it } from "vitest";
import { buildScaffoldArgs } from "../scaffold";

describe("scaffold", () => {
  describe("buildScaffoldArgs", () => {
    it("builds minimal agent args", () => {
      expect(
        buildScaffoldArgs({ kind: "agent", recipeId: "my-agent" })
      ).toEqual(["recipes", "scaffold", "my-agent"]);
    });

    it("builds agent args with agentId and name", () => {
      expect(
        buildScaffoldArgs({
          kind: "agent",
          recipeId: "template",
          agentId: "my-agent",
          name: "My Agent",
        })
      ).toEqual([
        "recipes",
        "scaffold",
        "template",
        "--agent-id",
        "my-agent",
        "--name",
        "My Agent",
      ]);
    });

    it("adds overwrite and applyConfig for agent", () => {
      expect(
        buildScaffoldArgs({
          kind: "agent",
          recipeId: "r",
          overwrite: true,
          applyConfig: true,
        })
      ).toEqual(["recipes", "scaffold", "r", "--overwrite", "--apply-config"]);
    });

    it("builds minimal team args", () => {
      expect(
        buildScaffoldArgs({ kind: "team", recipeId: "my-team" })
      ).toEqual(["recipes", "scaffold-team", "my-team"]);
    });

    it("adds teamId for team", () => {
      expect(
        buildScaffoldArgs({
          kind: "team",
          recipeId: "template",
          teamId: "my-team",
        })
      ).toEqual([
        "recipes",
        "scaffold-team",
        "template",
        "--team-id",
        "my-team",
      ]);
    });
  });
});
