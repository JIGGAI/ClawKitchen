// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WorkflowTriggerCronV1 } from "@/lib/workflows/types";

let TEAM_DIR = "";

const runOpenClawMock = vi.fn();

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

// Import after mocking
const { POST } = await import("../route");

describe("/api/teams/workflow-triggers POST", () => {
  beforeEach(async () => {
    runOpenClawMock.mockClear();
    runOpenClawMock.mockImplementation(async (args: string[]) => {
      const cmd = args.join(" ");
      
      if (cmd.includes("cron add")) {
        return { 
          ok: true, 
          stdout: JSON.stringify({ id: "cron-123" }), 
          stderr: "" 
        };
      }
      
      if (cmd.includes("cron edit") || cmd.includes("cron enable") || cmd.includes("cron disable") || cmd.includes("cron remove")) {
        return { ok: true, stdout: "", stderr: "" };
      }
      
      return { ok: false, stdout: "", stderr: "Unknown command" };
    });
    TEAM_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "ck-team-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(TEAM_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates cron jobs for enabled triggers", async () => {
    const triggers: WorkflowTriggerCronV1[] = [
      {
        kind: "cron",
        id: "trigger1",
        name: "Daily trigger",
        enabled: true,
        expr: "0 9 * * *",
        tz: "America/New_York"
      }
    ];

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        action: "sync",
        teamId: "team123",
        workflowId: "workflow456",
        triggers
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.created).toHaveLength(1);
    expect(json.created[0].triggerId).toBe("trigger1");
    
    expect(runOpenClawMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "cron", "add", "--agent", "main", "--session", "isolated", "--no-deliver",
        "--model", "anthropic/claude-sonnet-4-20250514",
        "--name", "workflow-trigger:team123:workflow456:trigger1",
        "--cron", "0 9 * * *", "--tz", "America/New_York"
      ])
    );
  });

  it("skips disabled triggers", async () => {
    const triggers: WorkflowTriggerCronV1[] = [
      {
        kind: "cron",
        id: "trigger1",
        name: "Disabled trigger",
        enabled: false,
        expr: "0 9 * * *"
      }
    ];

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        action: "sync",
        teamId: "team123",
        workflowId: "workflow456",
        triggers
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.created).toHaveLength(0);
  });

  it("returns 400 for missing required fields", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        action: "sync"
        // missing teamId and workflowId
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("teamId and workflowId are required");
  });

  it("returns 400 for invalid action", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        action: "invalid",
        teamId: "team123",
        workflowId: "workflow456",
        triggers: []
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("action must be 'sync'");
  });

  it("persists mapping state", async () => {
    const triggers: WorkflowTriggerCronV1[] = [
      {
        kind: "cron",
        id: "trigger1",
        name: "Test trigger",
        enabled: true,
        expr: "0 9 * * *"
      }
    ];

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        action: "sync",
        teamId: "team123",
        workflowId: "workflow456",
        triggers
      }),
      headers: { "content-type": "application/json" },
    });

    await POST(req);

    // Check that mapping file was created
    const mappingPath = path.join(TEAM_DIR, "notes", "cron-jobs.json");
    const mappingExists = await fs.access(mappingPath).then(() => true).catch(() => false);
    expect(mappingExists).toBe(true);

    const mappingContent = await fs.readFile(mappingPath, "utf8");
    const mapping = JSON.parse(mappingContent);
    expect(mapping.version).toBe(1);
    expect(mapping.entries["team:team123:workflow:workflow456:trigger:trigger1"]).toBeDefined();
    expect(mapping.entries["team:team123:workflow:workflow456:trigger:trigger1"].installedCronId).toBe("cron-123");
  });
});