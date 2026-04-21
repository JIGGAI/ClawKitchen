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
  // Env vars the route reads — snapshot and clear before each test so
  // behavior is deterministic regardless of the host environment. Any test
  // that needs a non-empty value sets it in its own body.
  const ENV_VARS_UNDER_TEST = [
    "KITCHEN_WORKFLOW_CRON_MODEL",
    "KITCHEN_WORKFLOW_CRON_SCHEDULE",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    runOpenClawMock.mockClear();
    for (const k of ENV_VARS_UNDER_TEST) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    TEAM_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "ck-team-"));
    AGENT_WS = await fs.mkdtemp(path.join(os.tmpdir(), "ck-agent-"));
  });

  afterEach(async () => {
    for (const k of ENV_VARS_UNDER_TEST) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
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
    const mapping = JSON.parse(mappingRaw) as { version: number; entries: Record<string, { installedCronId: string; updatedAtMs?: number; payloadSchemaVersion?: number }> };
    expect(mapping.version).toBe(1);

    // Key format matches ClawRecipes CronMappingStateV1 convention
    const key = "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-writer";
    expect(mapping.entries[key]).toBeDefined();
    expect(mapping.entries[key].installedCronId).toBe("cron-123");
    expect(mapping.entries[key].updatedAtMs).toBeTypeOf("number");

    // Verify the cron add call carries the defaults Kitchen installs today:
    // every 5 minutes, isolated session, 120s timeout, no forced model.
    const addCall = runOpenClawMock.mock.calls.find((c) => c[0].join(" ").startsWith("cron add"));
    expect(addCall).toBeDefined();
    const args = addCall![0];
    expect(args).toContain("--no-deliver");
    expect(args).toContain("*/5 * * * *");
    expect(args).toContain("--session");
    expect(args).toContain("isolated");
    expect(args).toContain("--timeout-seconds");
    expect(args).toContain("120");
    // Narrow-scope flags: LLM gets minimal context and can only invoke exec.
    // Without these, workers occasionally hallucinate wrong CLI paths and
    // silently drop ticks — we had a workflow stall for 25 minutes on this.
    expect(args).toContain("--light-context");
    expect(args).toContain("--tools");
    expect(args).toContain("exec");
    // No --model flag unless KITCHEN_WORKFLOW_CRON_MODEL is set (see new test).
    expect(args).not.toContain("--model");

    // Provenance records the payload schema version so future reconciles can
    // detect stale crons and migrate them.
    expect(mapping.entries[key].payloadSchemaVersion).toBe(2);
  });

  it("reinstalls a stale (pre-v2) worker cron on install", async () => {
    // Seed a v1 entry (no payloadSchemaVersion, existing cron id).
    await fs.mkdir(path.join(TEAM_DIR, "notes"), { recursive: true });
    await fs.writeFile(
      path.join(TEAM_DIR, "notes", "cron-jobs.json"),
      JSON.stringify({
        version: 1,
        entries: {
          "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-writer": {
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
        body: JSON.stringify({ action: "install", teamId: "claw-marketing-team", agentId: "claw-marketing-team-writer" }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { installedCronId: string };

    // Old v1 cron was removed, new v2 cron was installed.
    const rmCall = runOpenClawMock.mock.calls.find((c) => c[0].slice(0, 2).join(" ") === "cron rm");
    expect(rmCall).toBeDefined();
    expect(rmCall![0]).toContain("cron-old");
    expect(json.installedCronId).toBe("cron-123");

    // Mapping was updated to v2.
    const mappingRaw = await fs.readFile(path.join(TEAM_DIR, "notes", "cron-jobs.json"), "utf8");
    const mapping = JSON.parse(mappingRaw) as { entries: Record<string, { installedCronId: string; payloadSchemaVersion?: number }> };
    const key = "team:claw-marketing-team:recipe:workflow-worker:cron:claw-marketing-team-writer";
    expect(mapping.entries[key].installedCronId).toBe("cron-123");
    expect(mapping.entries[key].payloadSchemaVersion).toBe(2);
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
    const mapping = JSON.parse(mappingRaw) as { entries: Record<string, { installedCronId?: string; orphaned?: boolean; updatedAtMs?: number; payloadSchemaVersion?: number }> };
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

  it("passes --model when KITCHEN_WORKFLOW_CRON_MODEL is set, and custom schedule when KITCHEN_WORKFLOW_CRON_SCHEDULE is set", async () => {
    process.env.KITCHEN_WORKFLOW_CRON_MODEL = "openai/gpt-5.4";
    process.env.KITCHEN_WORKFLOW_CRON_SCHEDULE = "*/10 * * * *";

    // The route module reads process.env at call time via modelFlagArgs() /
    // workflowCronSchedule(), so we do NOT need vi.resetModules() here —
    // the cached import will still see the updated env.
    const { POST } = await import("../worker/route");

    const res = await POST(
      new Request("http://localhost/api/cron/worker", {
        method: "POST",
        body: JSON.stringify({ action: "install", teamId: "claw-marketing-team", agentId: "claw-marketing-team-writer" }),
      })
    );
    expect(res.status).toBe(200);

    const addCall = runOpenClawMock.mock.calls.find((c) => c[0].join(" ").startsWith("cron add"));
    expect(addCall).toBeDefined();
    const args = addCall![0];
    expect(args).toContain("--model");
    expect(args).toContain("openai/gpt-5.4");
    expect(args).toContain("*/10 * * * *");
    expect(args).not.toContain("*/5 * * * *");
  });
});
