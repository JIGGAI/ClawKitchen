import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../goals/[id]/promote/route";
import path from "node:path";

const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/exec", () => ({
  execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args),
}));
vi.mock("@/lib/goals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goals")>();
  return { ...actual, readGoal: vi.fn(), writeGoal: vi.fn() };
});
vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn(),
  readOpenClawConfig: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: { mkdir: vi.fn(), writeFile: vi.fn() },
}));

import { readGoal, writeGoal } from "@/lib/goals";
import { getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";
import fs from "node:fs/promises";

describe("api goals promote route", () => {
  const teamWs = "/mock-workspace/development-team";
  const existingGoal = {
    id: "my-goal",
    frontmatter: { id: "my-goal", title: "My Goal", tags: [], teams: [] },
    body: "## Existing body",
    raw: "",
  };

  beforeEach(() => {
    mockExecFileAsync.mockReset();
    vi.mocked(readGoal).mockReset();
    vi.mocked(writeGoal).mockReset();
    vi.mocked(getTeamWorkspaceDir).mockReset();
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.writeFile).mockReset();

    vi.mocked(getTeamWorkspaceDir).mockResolvedValue(teamWs);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it("returns 404 when goal not found", async () => {
    vi.mocked(readGoal).mockResolvedValue(null);

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Goal not found");
  });

  it("creates inbox file and updates goal on success", async () => {
    vi.mocked(readGoal).mockResolvedValue(existingGoal);
    vi.mocked(writeGoal).mockResolvedValue({
      frontmatter: { ...existingGoal.frontmatter, status: "active" },
      body: "",
      raw: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({});

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.goal.id).toBe("my-goal");
    expect(json.inboxPath).toContain("inbox");
    expect(json.inboxPath).toContain("goal");
    expect(fs.mkdir).toHaveBeenCalledWith(path.join(teamWs, "inbox"), { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("inbox"),
      expect.stringContaining("My Goal"),
      expect.any(Object)
    );
    expect(writeGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "my-goal",
        status: "active",
        body: expect.stringContaining("## Workflow"),
      })
    );
  });

  it("pingAttempted false when agentToAgent disabled", async () => {
    vi.mocked(readGoal).mockResolvedValue(existingGoal);
    vi.mocked(writeGoal).mockResolvedValue({
      frontmatter: existingGoal.frontmatter,
      body: "",
      raw: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({
      tools: { agentToAgent: { enabled: false } },
    });

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pingAttempted).toBe(false);
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it("pingAttempted true and pingOk true when agentToAgent enabled", async () => {
    vi.mocked(readGoal).mockResolvedValue(existingGoal);
    vi.mocked(writeGoal).mockResolvedValue({
      frontmatter: existingGoal.frontmatter,
      body: "",
      raw: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({
      tools: { agentToAgent: { enabled: true, allow: ["*"] } },
    });
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pingAttempted).toBe(true);
    expect(json.pingOk).toBe(true);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "openclaw",
      expect.arrayContaining(["agent", "--agent", "development-team-lead"]),
      expect.any(Object)
    );
  });

  it("pingOk false when exec fails", async () => {
    vi.mocked(readGoal).mockResolvedValue(existingGoal);
    vi.mocked(writeGoal).mockResolvedValue({
      frontmatter: existingGoal.frontmatter,
      body: "",
      raw: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({
      tools: { agentToAgent: { enabled: true, allow: ["*"] } },
    });
    mockExecFileAsync.mockRejectedValue(new Error("Command failed"));

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pingAttempted).toBe(true);
    expect(json.pingOk).toBe(false);
    expect(json.pingReason).toBe("Command failed");
  });

  it("uses alternate filename when EEXIST", async () => {
    vi.mocked(readGoal).mockResolvedValue(existingGoal);
    vi.mocked(writeGoal).mockResolvedValue({
      frontmatter: existingGoal.frontmatter,
      body: "",
      raw: "",
    });
    vi.mocked(readOpenClawConfig).mockResolvedValue({});

    const eexist = new Error("EEXIST") as Error & { code?: string };
    eexist.code = "EEXIST";

    vi.mocked(fs.writeFile)
      .mockRejectedValueOnce(eexist)
      .mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(200);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    const secondPath = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondPath).toContain("-goal-");
    expect(secondPath).toContain(".md");
  });

  it("returns 500 when readGoal throws", async () => {
    vi.mocked(readGoal).mockRejectedValue(new Error("File system error"));

    const res = await POST(
      new Request("https://test"),
      { params: Promise.resolve({ id: "my-goal" }) }
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("File system error");
  });
});
