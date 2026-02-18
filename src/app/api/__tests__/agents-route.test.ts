import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../agents/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "@/lib/openclaw";

describe("api agents route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
  });

  it("returns agents on success", async () => {
    const agents = [
      { id: "agent-1", identityName: "Agent 1", workspace: "/ws/1" },
    ];
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify(agents),
      stderr: "",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.agents).toHaveLength(1);
    expect(json.agents[0].id).toBe("agent-1");
  });

  it("returns 500 when runOpenClaw throws", async () => {
    vi.mocked(runOpenClaw).mockRejectedValue(new Error("Command failed"));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to list agents");
    expect(json.message).toBe("Command failed");
  });

  it("returns 500 when stdout is invalid JSON", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "not json",
      stderr: "",
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to list agents");
  });
});
