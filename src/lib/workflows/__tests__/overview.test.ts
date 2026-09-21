import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ root: "" }));

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn(async (teamId: string) => `${ctx.root}/workspace-${teamId}`),
}));
vi.mock("@/lib/manifest", () => ({ readManifest: vi.fn(async () => null) }));
vi.mock("@/lib/teams", () => ({ listLocalTeamIds: vi.fn(async () => ["alpha", "beta"]) }));

import { readManifest } from "@/lib/manifest";
import { listInstalledWorkflows, listRunGraphs, resolveTeamIds } from "@/lib/workflows/overview";

async function write(rel: string, data: unknown) {
  const p = path.join(ctx.root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, typeof data === "string" ? data : JSON.stringify(data), "utf8");
}

function runLog(runId: string, status: string) {
  return { runId, status, workflow: { id: "flow", name: "Flow", file: "flow.workflow.json" }, nodeStates: {} };
}

async function writeRun(team: string, runId: string, status: string) {
  await write(`workspace-${team}/shared-context/workflow-runs/${runId}/run.json`, runLog(runId, status));
}

beforeEach(async () => {
  ctx.root = await fs.mkdtemp(path.join(os.tmpdir(), "ck-workflows-overview-"));
});

afterEach(async () => {
  await fs.rm(ctx.root, { recursive: true, force: true });
});

describe("resolveTeamIds", () => {
  it("returns the requested team", async () => {
    expect(await resolveTeamIds(" alpha ")).toEqual(["alpha"]);
  });

  it("rejects team ids that could escape the workspace dir", async () => {
    await expect(resolveTeamIds("../etc")).rejects.toThrow("Invalid team id");
  });

  it("uses the manifest's teams when there is one", async () => {
    vi.mocked(readManifest).mockResolvedValueOnce({ teams: { zeta: {}, alpha: {} } } as never);
    expect(await resolveTeamIds("")).toEqual(["alpha", "zeta"]);
  });

  it("falls back to local team dirs without a manifest", async () => {
    expect(await resolveTeamIds(null)).toEqual(["alpha", "beta"]);
  });
});

describe("listRunGraphs", () => {
  it("orders runs across teams newest first, pinning runs awaiting approval", async () => {
    await writeRun("alpha", "2026-09-01t00-00-00-000z-aaaaaaaa", "completed");
    await writeRun("alpha", "2026-09-03t00-00-00-000z-bbbbbbbb", "running");
    await writeRun("beta", "2026-09-02t00-00-00-000z-cccccccc", "error");
    await writeRun("beta", "2026-01-01t00-00-00-000z-dddddddd", "awaiting_approval");

    const out = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 3 });

    expect(out.total).toBe(4);
    expect(out.runs.map((r) => [r.teamId, r.runId])).toEqual([
      ["beta", "2026-01-01t00-00-00-000z-dddddddd"],
      ["alpha", "2026-09-03t00-00-00-000z-bbbbbbbb"],
      ["beta", "2026-09-02t00-00-00-000z-cccccccc"],
    ]);
  });

  it("skips unreadable run files, stray files, and missing team dirs", async () => {
    await writeRun("alpha", "2026-09-01t00-00-00-000z-aaaaaaaa", "completed");
    await write("workspace-alpha/shared-context/workflow-runs/2026-09-02t00-00-00-000z-broken00/run.json", "{not json");
    await write("workspace-alpha/shared-context/workflow-runs/notes.txt", "hello");

    const out = await listRunGraphs({ teamIds: ["alpha", "missing"], limit: 20 });

    expect(out.total).toBe(1);
    expect(out.runs.map((r) => r.runId)).toEqual(["2026-09-01t00-00-00-000z-aaaaaaaa"]);
  });

  it("draws the run from its team's workflow file and approval file", async () => {
    const runId = "2026-09-05t00-00-00-000z-eeeeeeee";
    await write("workspace-alpha/shared-context/workflows/flow.workflow.json", {
      id: "flow",
      name: "Flow",
      nodes: [{ id: "start", type: "start" }, { id: "approve", type: "human_approval" }],
      edges: [{ id: "e1", from: "start", to: "approve" }],
    });
    await write(`workspace-alpha/shared-context/workflow-runs/${runId}/run.json`, {
      ...runLog(runId, "awaiting_approval"),
      nodeStates: { start: { status: "success" } },
    });
    await write(`workspace-alpha/shared-context/workflow-runs/${runId}/approvals/approval.json`, {
      nodeId: "approve",
      status: "pending",
    });

    const [run] = (await listRunGraphs({ teamIds: ["alpha"], limit: 20 })).runs;

    expect(run.edges).toEqual([{ from: "start", to: "approve", on: "success" }]);
    expect(run.approvalNodeId).toBe("approve");
    expect(run.nodes.map((n) => [n.id, n.status])).toEqual([
      ["start", "success"],
      ["approve", "waiting"],
    ]);
  });
});

describe("listRunGraphs filters and sort", () => {
  async function writeRunOf(team: string, runId: string, status: string, workflow: string, updatedAt: string) {
    await write(`workspace-${team}/shared-context/workflow-runs/${runId}/run.json`, {
      runId,
      status,
      updatedAt,
      workflow: { id: workflow, name: workflow.toUpperCase(), file: `${workflow}.workflow.json` },
      nodeStates: {},
    });
  }

  beforeEach(async () => {
    await writeRunOf("alpha", "2026-09-01t00-00-00-000z-aaaaaaaa", "completed", "post", "2026-09-10T00:00:00.000Z");
    await writeRunOf("alpha", "2026-09-03t00-00-00-000z-bbbbbbbb", "error", "post", "2026-09-03T01:00:00.000Z");
    await writeRunOf("beta", "2026-09-02t00-00-00-000z-cccccccc", "error", "plan", "2026-09-02T01:00:00.000Z");
    await writeRunOf("beta", "2026-01-01t00-00-00-000z-dddddddd", "awaiting_approval", "plan", "2026-01-01T01:00:00.000Z");
  });

  const ids = (runs: { runId: string }[]) => runs.map((r) => r.runId.slice(0, 10));

  it("returns options for every workflow and status before filtering", async () => {
    const out = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { status: "error" } });
    expect(out.facets).toEqual({
      workflows: [
        { id: "plan", name: "PLAN", count: 2 },
        { id: "post", name: "POST", count: 2 },
      ],
      statuses: [
        { status: "error", count: 2 },
        { status: "awaiting_approval", count: 1 },
        { status: "completed", count: 1 },
      ],
    });
  });

  it("filters by workflow, status and search text, and counts only the matches", async () => {
    const byWorkflow = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { workflow: "post" } });
    expect([ids(byWorkflow.runs), byWorkflow.total]).toEqual([["2026-09-03", "2026-09-01"], 2]);

    const byStatus = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 1, filters: { status: "error" } });
    expect([ids(byStatus.runs), byStatus.total]).toEqual([["2026-09-03"], 2]);

    const bySearch = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { q: "BETA" } });
    expect(ids(bySearch.runs)).toEqual(["2026-01-01", "2026-09-02"]);

    const byName = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { q: "pla" } });
    expect(ids(byName.runs)).toEqual(["2026-01-01", "2026-09-02"]);
  });

  it("sorts oldest first or by last update, keeping approvals pinned", async () => {
    const oldest = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { sort: "oldest" } });
    expect(ids(oldest.runs)).toEqual(["2026-01-01", "2026-09-01", "2026-09-02", "2026-09-03"]);

    const updated = await listRunGraphs({ teamIds: ["alpha", "beta"], limit: 20, filters: { sort: "updated" } });
    expect(ids(updated.runs)).toEqual(["2026-01-01", "2026-09-01", "2026-09-03", "2026-09-02"]);
  });
});

describe("listInstalledWorkflows", () => {
  it("lists workflow files across teams with enabled cron triggers, sorted by name", async () => {
    await write("workspace-alpha/shared-context/workflows/zed.workflow.json", {
      name: "Zed",
      nodes: [{ id: "a" }, { id: "b" }],
      triggers: [
        { kind: "cron", id: "t1", expr: "0 9 * * 1", enabled: true },
        { kind: "cron", id: "t2", expr: "0 10 * * 1", enabled: false },
      ],
    });
    await write("workspace-beta/shared-context/workflows/alpha-flow.workflow.json", { nodes: [] });
    await write("workspace-beta/shared-context/workflows/broken.workflow.json", "{nope");
    await write("workspace-beta/shared-context/workflows/readme.md", "# hi");

    expect(await listInstalledWorkflows(["alpha", "beta", "missing"])).toEqual([
      { teamId: "beta", id: "alpha-flow", name: null, nodeCount: 0, cron: [] },
      { teamId: "alpha", id: "zed", name: "Zed", nodeCount: 2, cron: ["0 9 * * 1"] },
    ]);
  });
});
