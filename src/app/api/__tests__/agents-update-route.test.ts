import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../agents/update/route";

vi.mock("@/lib/gateway", () => ({
  gatewayConfigGet: vi.fn(),
  gatewayConfigPatch: vi.fn(),
}));

import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

describe("api agents update route", () => {
  const cfgWithAgent = {
    agents: {
      list: [
        { id: "agent-1", workspace: "/ws", model: "gpt-4", identity: { name: "Old", emoji: "🧑" } },
      ],
    },
  };

  beforeEach(() => {
    vi.mocked(gatewayConfigGet).mockReset();
    vi.mocked(gatewayConfigPatch).mockReset();

    vi.mocked(gatewayConfigGet).mockResolvedValue({
      raw: JSON.stringify(cfgWithAgent),
      hash: "abc",
    });
    vi.mocked(gatewayConfigPatch).mockResolvedValue(undefined);
  });

  it("throws when agentId missing", async () => {
    await expect(
      POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ agentId: "   " }),
        })
      )
    ).rejects.toThrow("agentId is required");
  });

  it("returns 404 when agent not in config", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ agentId: "missing" }),
      })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Agent not found");
  });

  it("returns ok and patches config on success", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          agentId: "agent-1",
          patch: {
            workspace: " /new/ws ",
            model: "gpt-4o",
            identity: { name: "New Name", theme: "dark", emoji: "🤖", avatar: "x" },
          },
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agentId).toBe("agent-1");

    expect(gatewayConfigPatch).toHaveBeenCalled();
    const [patch] = vi.mocked(gatewayConfigPatch).mock.calls[0];
    expect(patch.agents.list[0].workspace).toBe("/new/ws");
    expect(patch.agents.list[0].model).toBe("gpt-4o");
    expect(patch.agents.list[0].identity).toMatchObject({
      name: "New Name",
      theme: "dark",
      emoji: "🤖",
      avatar: "x",
    });
  });

  it("finds agent case-insensitively", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ agentId: "AGENT-1", patch: {} }),
      })
    );
    expect(res.status).toBe(200);
    expect(gatewayConfigPatch).toHaveBeenCalled();
  });

  describe("on a host storing agents at agents.entries", () => {
    const cfgWithEntries = {
      agents: {
        defaults: { systemAgent: { agentId: "main" } },
        entries: {
          "agent-1": { workspace: "/ws", model: "gpt-4", identity: { name: "Old", emoji: "🧑" } },
          main: { workspace: "/ws-main" },
        },
      },
    };

    beforeEach(() => {
      vi.mocked(gatewayConfigGet).mockResolvedValue({ raw: JSON.stringify(cfgWithEntries), hash: "abc" });
    });

    it("finds the agent and patches the entry, never agents.list", async () => {
      const res = await POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({
            agentId: "agent-1",
            patch: { workspace: " /new/ws ", model: "gpt-4o", identity: { name: "New Name" } },
          }),
        })
      );
      expect(res.status).toBe(200);

      const [patch] = vi.mocked(gatewayConfigPatch).mock.calls[0] as [Record<string, never>];
      const agents = patch.agents as unknown as {
        list?: unknown;
        entries: Record<string, { workspace?: string; model?: string; identity?: Record<string, string>; id?: string }>;
      };
      // A stale agents.list would be migrated back over entries by OpenClaw.
      expect(agents.list).toBeUndefined();
      expect(agents.entries["agent-1"].workspace).toBe("/new/ws");
      expect(agents.entries["agent-1"].model).toBe("gpt-4o");
      expect(agents.entries["agent-1"].identity).toMatchObject({ name: "New Name", emoji: "🧑" });
      // The id is the key in this shape, not a field inside the entry.
      expect(agents.entries["agent-1"].id).toBeUndefined();
      // Patching is scoped to the one agent, leaving siblings to the recursive merge.
      expect(agents.entries.main).toBeUndefined();
    });

    it("still 404s for an unknown agent", async () => {
      const res = await POST(
        new Request("https://test", { method: "POST", body: JSON.stringify({ agentId: "missing" }) })
      );
      expect(res.status).toBe(404);
    });
  });
});
