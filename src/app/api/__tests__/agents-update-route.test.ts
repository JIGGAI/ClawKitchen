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
});
