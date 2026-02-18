import { describe, expect, it, vi, beforeEach } from "vitest";
import * as path from "node:path";
import fs from "node:fs/promises";
import {
  assertSafeGoalId,
  splitFrontmatter,
  normalizeFrontmatter,
  listGoals,
  readGoal,
  writeGoal,
  deleteGoal,
  goalErrorStatus,
} from "../goals";
import { getWorkspaceGoalsDir } from "@/lib/paths";

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("@/lib/paths", () => ({
  getWorkspaceGoalsDir: vi.fn(),
}));

describe("goals", () => {
  describe("assertSafeGoalId", () => {
    it("accepts valid ids", () => {
      expect(() => assertSafeGoalId("ab")).not.toThrow();
      expect(() => assertSafeGoalId("my-goal-123")).not.toThrow();
      expect(() => assertSafeGoalId("increase-trial-activation")).not.toThrow();
    });

    it("rejects invalid ids", () => {
      expect(() => assertSafeGoalId("")).toThrow("Invalid goal id");
      expect(() => assertSafeGoalId("A")).toThrow("Invalid goal id");
      expect(() => assertSafeGoalId("invalid_id")).toThrow("Invalid goal id");
      expect(() => assertSafeGoalId("no spaces")).toThrow("Invalid goal id");
      expect(() => assertSafeGoalId("-leading")).toThrow("Invalid goal id");
      expect(() => assertSafeGoalId("a".repeat(65))).toThrow("Invalid goal id");
    });
  });

  describe("goalErrorStatus", () => {
    it("returns 400 for validation errors", () => {
      expect(goalErrorStatus("Invalid goal id")).toBe(400);
      expect(goalErrorStatus("Path traversal rejected")).toBe(400);
    });
    it("returns 500 for other errors", () => {
      expect(goalErrorStatus("fs error")).toBe(500);
    });
  });

  describe("splitFrontmatter", () => {
    it("parses valid frontmatter", () => {
      const md = `---
id: foo
title: My Goal
status: active
---
Body here`;
      const { fm, body } = splitFrontmatter(md);
      expect(fm).toEqual({ id: "foo", title: "My Goal", status: "active" });
      expect(body.trim()).toBe("Body here");
    });

    it("returns empty fm and full body when no frontmatter", () => {
      const md = "# Just markdown\n\nNo frontmatter";
      const { fm, body } = splitFrontmatter(md);
      expect(fm).toEqual({});
      expect(body).toBe("# Just markdown\n\nNo frontmatter");
    });

    it("handles empty frontmatter", () => {
      const md = `---
---
Body`;
      const { fm, body } = splitFrontmatter(md);
      expect(fm).toEqual({});
      // Implementation returns full md when closing --- not found from position 4
      expect(body).toContain("Body");
    });
  });

  describe("normalizeFrontmatter", () => {
    it("normalizes full input", () => {
      const input = {
        id: "my-goal",
        title: "My Goal",
        status: "active",
        tags: ["a", "b"],
        teams: ["team1"],
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const result = normalizeFrontmatter(input, "fallback-id", "Fallback Title");
      expect(result).toEqual({
        id: "my-goal",
        title: "My Goal",
        status: "active",
        tags: ["a", "b"],
        teams: ["team1"],
        updatedAt: "2026-01-01T00:00:00Z",
      });
    });

    it("uses fallbacks for missing fields", () => {
      const result = normalizeFrontmatter({}, "fb-id", "Fallback");
      expect(result.id).toBe("fb-id");
      expect(result.title).toBe("Fallback");
      expect(result.status).toBe("planned");
      expect(result.tags).toEqual([]);
      expect(result.teams).toEqual([]);
      expect(result.updatedAt).toBeDefined();
    });

    it("normalizes status to planned when invalid", () => {
      const result = normalizeFrontmatter({ status: "invalid" }, "id", "Title");
      expect(result.status).toBe("planned");
    });

    it("accepts active and done status", () => {
      expect(normalizeFrontmatter({ status: "active" }, "id", "").status).toBe("active");
      expect(normalizeFrontmatter({ status: "done" }, "id", "").status).toBe("done");
    });

    it("handles non-object input", () => {
      const result = normalizeFrontmatter(null, "id", "t");
      expect(result.id).toBe("id");
      expect(result.title).toBe("t");
    });
  });

  describe("listGoals", () => {
    beforeEach(() => {
      vi.mocked(getWorkspaceGoalsDir).mockResolvedValue("/mock-workspace/goals");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    });

    it("returns sorted goals", async () => {
      vi.mocked(fs.readdir).mockResolvedValue(["goal-b.md", "goal-a.md"]);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(`---
id: goal-b
title: B
status: done
tags: []
teams: []
updatedAt: 2026-01-02T00:00:00Z
---
Body B`)
        .mockResolvedValueOnce(`---
id: goal-a
title: A
status: active
tags: []
teams: []
updatedAt: 2026-01-01T00:00:00Z
---
Body A`);

      const result = await listGoals();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("goal-a");
      expect(result[0].status).toBe("active");
      expect(result[1].id).toBe("goal-b");
      expect(result[1].status).toBe("done");
    });

    it("returns empty array when no files", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      const result = await listGoals();
      expect(result).toEqual([]);
    });
  });

  describe("readGoal", () => {
    beforeEach(() => {
      vi.mocked(getWorkspaceGoalsDir).mockResolvedValue("/mock-workspace/goals");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    });

    it("returns goal when exists", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`---
id: my-goal
title: My Goal
status: active
---
Body text`);

      const result = await readGoal("my-goal");
      expect(result).not.toBeNull();
      expect(result!.frontmatter.id).toBe("my-goal");
      expect(result!.frontmatter.title).toBe("My Goal");
      expect(result!.body.trim()).toBe("Body text");
    });

    it("returns null when file not found", async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
      const result = await readGoal("missing-goal");
      expect(result).toBeNull();
    });

    it("throws on invalid id", async () => {
      await expect(readGoal("")).rejects.toThrow("Invalid goal id");
    });
  });

  describe("writeGoal", () => {
    beforeEach(() => {
      vi.mocked(getWorkspaceGoalsDir).mockResolvedValue("/mock-workspace/goals");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it("writes goal and returns frontmatter", async () => {
      const result = await writeGoal({
        id: "new-goal",
        title: "New Goal",
        body: "Content",
      });
      expect(result.frontmatter.id).toBe("new-goal");
      expect(result.frontmatter.title).toBe("New Goal");
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join("/mock-workspace/goals", "new-goal.md"),
        expect.stringContaining("New Goal"),
        "utf8"
      );
    });

    it("throws on invalid id", async () => {
      await expect(writeGoal({ id: "bad id", title: "X", body: "" })).rejects.toThrow("Invalid goal id");
    });
  });

  describe("deleteGoal", () => {
    beforeEach(() => {
      vi.mocked(getWorkspaceGoalsDir).mockResolvedValue("/mock-workspace/goals");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
    });

    it("returns ok when deleted", async () => {
      const result = await deleteGoal("my-goal");
      expect(result).toEqual({ ok: true });
      expect(fs.unlink).toHaveBeenCalledWith(path.join("/mock-workspace/goals", "my-goal.md"));
    });

    it("returns not_found when file missing", async () => {
      vi.mocked(fs.unlink).mockRejectedValue({ code: "ENOENT" });
      const result = await deleteGoal("missing");
      expect(result).toEqual({ ok: false, reason: "not_found" });
    });

    it("throws on other errors", async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error("Permission denied"));
      await expect(deleteGoal("my-goal")).rejects.toThrow("Permission denied");
    });
  });
});
