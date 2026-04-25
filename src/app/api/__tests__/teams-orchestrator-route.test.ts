import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../teams/orchestrator/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/kitchen-api", () => ({
  getKitchenApi: vi.fn(() => ({
    runtime: {
      system: {
        runCommandWithTimeout: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      },
    },
  })),
}));

import { runOpenClaw } from "@/lib/openclaw";
import { _resetOpenClawCache } from "@/lib/openclaw-cache";

describe("api teams orchestrator route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    // Route uses cachedRunOpenClaw via listAgentsCached; reset between tests.
    _resetOpenClawCache();
  });

  it("returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 200 with present:false when no orchestrator agent found", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      stdout: JSON.stringify([{ id: "other-agent", workspace: "/home" }]),
      stderr: "",
      exitCode: 0,
    });
    const res = await GET(new Request("https://test?teamId=team1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.present).toBe(false);
  });

  it("returns 200 with present:true when orchestrator agent found", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      stdout: JSON.stringify([
        { id: "team1-swarm-orchestrator", workspace: "/home/workspace-team1" },
      ]),
      stderr: "",
      exitCode: 0,
    });
    const res = await GET(new Request("https://test?teamId=team1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.present).toBe(true);
    expect(json.agent.id).toBe("team1-swarm-orchestrator");
  });
});
