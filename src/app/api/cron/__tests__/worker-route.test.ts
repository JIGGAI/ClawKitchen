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

  it("installs a worker cron and writes provenance to team workspace", async () => {
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

    // Provenance is stored in the team workspace (not per-agent workspace)
    const mappingRaw = await fs.readFile(path.join(TEAM_DIR, "notes", "cron-jobs.json"), "utf8");
    const mapping = JSON.parse(mappingRaw) as { version: number; entries: Record<string, { installedCronId: string; updatedAtMs?: number }> };
    expect(mapping.version).toBe(1);

    // Key format matches ClawRecipes CronMappingStateV1 convention
    const key = "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-writer";
    expect(mapping.entries[key]).toBeDefined();
    expect(mapping.entries[key].installedCronId).toBe("cron-123");
    expect(mapping.entries[key].updatedAtMs).toBeTypeOf("number");

    // Verify --no-deliver was passed in the cron add call
    const addCall = runOpenClawMock.mock.calls.find((c) => c[0].join(" ").startsWith("cron add"));
    expect(addCall).toBeDefined();
    expect(addCall![0]).toContain("--no-deliver");
    expect(addCall![0]).toContain("*/15 * * * *");
  });

  it("reconcile installs missing and disables orphaned in team mapping", async () => {
    // Write a workflow referencing the agent.
    await fs.mkdir(path.join(TEAM_DIR, "shared-context", "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(TEAM_DIR, "shared-context", "workflows", "marketing-cadence-v1.workflow.json"),
      JSON.stringify({ nodes: [{ id: "n1", type: "tool", config: { agentId: "claw-marketing-team-writer" } }] }, null, 2),
      "utf8"
    );

    // Seed an orphaned entry in the team mapping (old agent that's no longer in the workflow)
    await fs.mkdir(path.join(TEAM_DIR, "notes"), { recursive: true });
    await fs.writeFile(
      path.join(TEAM_DIR, "notes", "cron-jobs.json"),
      JSON.stringify({
        version: 1,
        entries: {
          "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-old": {
            installedCronId: "cron-old",
            updatedAtMs: Date.now() - 60000,
          },
        },
      }, null, 2),
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
    const json = (await res.json()) as { ok: boolean; installed: unknown[]; disabled: Array<{ installedCronId: string; key: string }> };
    expect(json.ok).toBe(true);

    // The orphaned entry should be marked orphaned
    const mappingRaw = await fs.readFile(path.join(TEAM_DIR, "notes", "cron-jobs.json"), "utf8");
    const mapping = JSON.parse(mappingRaw) as { entries: Record<string, { orphaned?: boolean; updatedAtMs?: number }> };
    const orphanKey = "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-old";
    expect(mapping.entries[orphanKey].orphaned).toBe(true);

    // The required agent should be installed
    const writerKey = "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-writer";
    expect(mapping.entries[writerKey]).toBeDefined();
    expect(mapping.entries[writerKey].installedCronId).toBe("cron-123");

    // cron disable should have been called for the orphaned entry
    const disableCall = runOpenClawMock.mock.calls.find((c) => c[0].join(" ").includes("cron disable"));
    expect(disableCall).toBeDefined();
    expect(disableCall![0]).toContain("cron-old");
  });
});
