import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveAgentWorkspace } from "../agents";

vi.mock("../openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "../openclaw";

describe("agents", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
  });

  describe("resolveAgentWorkspace", () => {
    it("returns workspace when agent found", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "a1", workspace: "/ws/a1" }]),
        stderr: "",
      });
      expect(await resolveAgentWorkspace("a1")).toBe("/ws/a1");
    });

    it("throws when agent not found", async () => {
      vi.mocked(runOpenClaw).mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify([{ id: "other" }]),
        stderr: "",
      });
      await expect(resolveAgentWorkspace("missing")).rejects.toThrow(
        "Agent workspace not found for missing"
      );
    });
  });
});
