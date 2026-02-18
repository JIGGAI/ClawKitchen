import { describe, expect, it } from "vitest";
import { suggestIds, scaffoldCmdForKind, patchFrontmatter } from "../recipe-clone";

describe("recipe-clone", () => {
  describe("suggestIds", () => {
    it("returns suggested ids for base id", () => {
      expect(suggestIds("my-agent")).toEqual([
        "custom-my-agent",
        "my-my-agent",
        "my-agent-2",
        "my-agent-alt",
      ]);
    });

    it("uses recipe when base empty", () => {
      expect(suggestIds("")).toEqual(["custom-recipe", "my-recipe", "recipe-2", "recipe-alt"]);
    });
  });

  describe("scaffoldCmdForKind", () => {
    it("returns team scaffold args", () => {
      expect(scaffoldCmdForKind("team", "my-team")).toEqual([
        "recipes",
        "scaffold-team",
        "my-team",
        "--team-id",
        "my-team",
        "--overwrite",
      ]);
    });

    it("returns agent scaffold args", () => {
      expect(scaffoldCmdForKind("agent", "my-agent")).toEqual([
        "recipes",
        "scaffold",
        "my-agent",
        "--agent-id",
        "my-agent",
        "--overwrite",
      ]);
    });

    it("returns null for unsupported kind", () => {
      expect(scaffoldCmdForKind("other", "x")).toBeNull();
    });
  });

  describe("patchFrontmatter", () => {
    it("patches id and optionally name for agent", () => {
      const md = `---
id: source
kind: agent
name: Source Agent
---
# Body`;
      const { next, kind } = patchFrontmatter(md, "my-agent", "My Agent");
      expect(kind).toBe("agent");
      expect(next).toContain("id: my-agent");
      expect(next).toContain("name: My Agent");
      expect(next).toContain("# Body");
    });

    it("patches teamId for team kind", () => {
      const md = `---
id: source
kind: team
---
# Body`;
      const { next, kind } = patchFrontmatter(md, "my-team", undefined);
      expect(kind).toBe("team");
      expect(next).toContain("id: my-team");
      expect(next).toContain("teamId: my-team");
    });

    it("throws when frontmatter not terminated", () => {
      const md = `---
id: x`;
      expect(() => patchFrontmatter(md, "y", undefined)).toThrow(
        "Recipe frontmatter not terminated (---)"
      );
    });
  });
});
