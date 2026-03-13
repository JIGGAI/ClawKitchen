// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

let TEAM_DIR = "";
let AGENT_WS = "";

const runOpenClawMock = vi.fn(async (args: string[]) => {
  const cmd = args.join(" ");
  if (cmd.startsWith("config get agents.list")) {
    return {
      ok: true,
      stdout: JSON.stringify([{ id: "claw-marketing-team-writer", workspace: AGENT_WS }]),
      stderr: "",
    };
  }
  if (cmd.startsWith("cron add")) {
    return { ok: true, stdout: JSON.stringify({ job: { id: "cron-123" } }), stderr: "" };
  }
  if (cmd.startsWith("cron rm")) {
    return { ok: true, stdout: "", stderr: "" };
  }
  if (cmd.startsWith("cron enable")) {
    return { ok: true, stdout: "", stderr: "" };
  }
  if (cmd.startsWith("cron disable")) {
    return { ok: true, stdout: "", stderr: "" };
  }
  return { ok: true, stdout: "", stderr: "" };
});

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: runOpenClawMock,
}));

vi.mock("@/lib/paths", async () => {
  const actual = await vi.importActual<typeof import("@/lib/paths")>("@/lib/paths");
  return {
    ...actual,
    getTeamWorkspaceDir: async () => TEAM_DIR,
  };
});

describe("/api/cron/worker POST", () => {
  beforeEach(async () => {
    runOpenClawMock.mockClear();
    TEAM_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "ck-team-"));
    AGENT_WS = await fs.mkdtemp(path.join(os.tmpdir(), "ck-agent-"));
  });

  afterEach(async () => {
    if (TEAM_DIR) await fs.rm(TEAM_DIR, { recursive: true, force: true });
    if (AGENT_WS) await fs.rm(AGENT_WS, { recursive: true, force: true });
  });

  it("installs a worker cron and writes provenance", async () => {
    const { POST } = await import("../worker/route");

    const res = await POST(
      new Request("http://localhost/api/cron/worker", {
        method: "POST",
        body: JSON.stringify({ action: "install", teamId: "claw-marketing-team", agentId: "claw-marketing-team-writer" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; installedCronId: string; mappingPath: string; key: string };
    expect(json.ok).toBe(true);
    expect(json.installedCronId).toBe("cron-123");

    const mappingRaw = await fs.readFile(path.join(AGENT_WS, "notes", "cron-jobs.json"), "utf8");
    const mapping = JSON.parse(mappingRaw) as { version: number; entries: Record<string, { installedCronId: string }> };
    expect(mapping.version).toBe(1);
    expect(mapping.entries["workflow-worker:claw-marketing-team:claw-marketing-team-writer"].installedCronId).toBe("cron-123");
  });

  it("reinstalling an existing worker cron replaces stale tracked jobs and uses silent delivery", async () => {
    await fs.mkdir(path.join(AGENT_WS, "notes"), { recursive: true });
    await fs.writeFile(
      path.join(AGENT_WS, "notes", "cron-jobs.json"),
      JSON.stringify({ version: 1, entries: { "workflow-worker:claw-marketing-team:claw-marketing-team-writer": { installedCronId: "cron-old" } } }, null, 2),
      "utf8"
    );

    const { POST } = await import("../worker/route");
    const res = await POST(
      new Request("http://localhost/api/cron/worker", {
        method: "POST",
        body: JSON.stringify({ action: "install", teamId: "claw-marketing-team", agentId: "claw-marketing-team-writer" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; installedCronId: string; alreadyInstalled: boolean };
    expect(json.ok).toBe(true);
    expect(json.alreadyInstalled).toBe(true);
    expect(json.installedCronId).toBe("cron-123");
    expect(runOpenClawMock).toHaveBeenCalledWith(["cron", "rm", "cron-old"]);
    expect(runOpenClawMock).toHaveBeenCalledWith(expect.arrayContaining(["cron", "add", "--delivery", "none"]));

    const mappingRaw = await fs.readFile(path.join(AGENT_WS, "notes", "cron-jobs.json"), "utf8");
    const mapping = JSON.parse(mappingRaw) as { entries: Record<string, { installedCronId: string }> };
    expect(mapping.entries["workflow-worker:claw-marketing-team:claw-marketing-team-writer"].installedCronId).toBe("cron-123");
  });

  it("reconcile installs missing and disables orphaned", async () => {
    // Write a workflow referencing the agent.
    await fs.mkdir(path.join(TEAM_DIR, "shared-context", "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(TEAM_DIR, "shared-context", "workflows", "marketing-cadence-v1.workflow.json"),
      JSON.stringify({ nodes: [{ id: "n1", type: "tool", config: { agentId: "claw-marketing-team-writer" } }] }, null, 2),
      "utf8"
    );

    // Seed an orphaned mapping in a different agent workspace.
    const OTHER_WS = await fs.mkdtemp(path.join(os.tmpdir(), "ck-agent2-"));
    runOpenClawMock.mockImplementation(async (args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("config get agents.list")) {
        return {
          ok: true,
          stdout: JSON.stringify([
            { id: "claw-marketing-team-writer", workspace: AGENT_WS },
            { id: "claw-marketing-team-old", workspace: OTHER_WS },
          ]),
          stderr: "",
        };
      }
      if (cmd.startsWith("cron add")) return { ok: true, stdout: JSON.stringify({ job: { id: "cron-123" } }), stderr: "" };
      if (cmd.startsWith("cron enable")) return { ok: true, stdout: "", stderr: "" };
      if (cmd.startsWith("cron disable")) return { ok: true, stdout: "", stderr: "" };
      return { ok: true, stdout: "", stderr: "" };
    });

    await fs.mkdir(path.join(OTHER_WS, "notes"), { recursive: true });
    await fs.writeFile(
      path.join(OTHER_WS, "notes", "cron-jobs.json"),
      JSON.stringify({ version: 1, entries: { "workflow-worker:claw-marketing-team:claw-marketing-team-old": { installedCronId: "cron-old" } } }, null, 2),
      "utf8"
    );

    const { POST } = await import("../worker/route");
    const res = await POST(
      new Request("http://localhost/api/cron/worker", {
        method: "POST",
        body: JSON.stringify({ action: "reconcile", teamId: "claw-marketing-team" }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; disabled: Array<{ installedCronId: string }> };
    expect(json.ok).toBe(true);

    const otherRaw = await fs.readFile(path.join(OTHER_WS, "notes", "cron-jobs.json"), "utf8");
    const other = JSON.parse(otherRaw) as { entries: Record<string, { orphaned?: boolean }> };
    expect(other.entries["workflow-worker:claw-marketing-team:claw-marketing-team-old"].orphaned).toBe(true);

    await fs.rm(OTHER_WS, { recursive: true, force: true });
  });
});
