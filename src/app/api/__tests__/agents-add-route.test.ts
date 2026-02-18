import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../agents/add/route";
import path from "node:path";

const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/exec", () => ({
  execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args),
}));
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
  },
}));

import fs from "node:fs/promises";

const baseWorkspace = "/mock-workspace";
const existingConfig = {
  agents: {
    defaults: { workspace: baseWorkspace },
    list: [{ id: "existing", workspace: "/ws/existing" }],
  },
};

describe("api agents add route", () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();
    vi.mocked(fs.copyFile).mockReset();
    vi.mocked(fs.rename).mockReset();

    vi.stubEnv("HOME", "/mock-home");
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingConfig));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("returns 400 when agent id missing", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("agent id is required");
  });

  it("returns 400 when agent id invalid format", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ newAgentId: "bad id!" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("match");
  });

  it("returns 500 when HOME not set", async () => {
    vi.stubEnv("HOME", "");

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ newAgentId: "my-agent" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("HOME is not set");
  });

  it("returns 500 when workspace not set in config", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ agents: {} })
    );

    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ newAgentId: "my-agent" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("agents.defaults.workspace not set");
  });

  it("returns 409 when agent exists and overwrite false", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ newAgentId: "existing" }),
      })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Agent already exists: existing");
  });

  it("returns ok and restarts gateway on success", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({
          newAgentId: "my-agent",
          name: "My Agent",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agentId).toBe("my-agent");
    expect(json.restarted).toBe(true);
    expect(json.workspace).toBe(
      path.resolve(baseWorkspace, "..", "workspace-my-agent")
    );
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "openclaw",
      ["gateway", "restart"],
      expect.objectContaining({ timeout: 120000 })
    );
  });
});
