import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../agents/identity/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "@/lib/openclaw";

describe("api agents identity route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
  });

  it("returns 400 when agentId missing", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("agentId is required");
  });

  it("returns ok with stdout/stderr on success", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "Updated identity",
      stderr: "",
    });

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ agentId: "my-agent" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stdout).toBe("Updated identity");
    expect(runOpenClaw).toHaveBeenCalledWith(["agents", "set-identity", "my-agent"]);
  });

  it("passes optional name, emoji, theme, avatar", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          agentId: "a",
          name: "Bob",
          emoji: "🤖",
          theme: "dark",
          avatar: "url",
        }),
      })
    );
    expect(runOpenClaw).toHaveBeenCalledWith([
      "agents",
      "set-identity",
      "a",
      "--name",
      "Bob",
      "--emoji",
      "🤖",
      "--theme",
      "dark",
      "--avatar",
      "url",
    ]);
  });

  it("returns 500 when runOpenClaw throws", async () => {
    vi.mocked(runOpenClaw).mockRejectedValue(new Error("CLI failed"));

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ agentId: "a" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to set agent identity");
    expect(json.message).toBe("CLI failed");
  });
});
