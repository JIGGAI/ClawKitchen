# Workflows Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A top-level `/workflows` page in ClawKitchen listing every installed workflow and drawing each run as its graph, with pending approvals answerable in place.

**Architecture:** A pure `run-graph.ts` merges a workflow file's topology with a run's `nodeStates`. `overview.ts` does the file reads (team ids, installed workflows, runs ordered approval-first). A thin API route serves runs to a polling client component that renders a ported SVG graph and reuses the existing approve/resume POST.

**Tech Stack:** Next 16 App Router, React 19, TypeScript, Tailwind v4 + `--ck-*` tokens, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-16-workflows-page-design.md`

## Global Constraints

- Work only in the worktree `~/ClawKitchen-workflows-page` (branch `feat/workflows-page`). Never build, install or check out in `~/ClawKitchen` — it is the live HMX plugin.
- Do not modify the team workflow editor (`src/app/teams/[teamId]/workflows/**`, `src/components/WorkflowCanvas.tsx`) or `/runs`.
- No ClawRecipes changes. No new npm dependencies.
- Approvals go through the existing `POST /api/teams/workflow-runs {teamId, workflowId, runId, action: "approve" | "request_changes"}`.
- Node 22 (`node -v` → v22.x).
- Component tests are excluded by `vitest.config.ts`; UI is verified with Playwright against a built server on a spare port.
- Never approve a real HMX run while verifying; intercept the POST.

## File Structure

| File | Responsibility |
|---|---|
| Create `src/lib/workflows/run-graph.ts` | Types, `buildRunGraph`, `layoutGraph` (pure) |
| Create `src/lib/workflows/__tests__/run-graph.test.ts` | Unit tests for the above |
| Create `src/lib/workflows/overview.ts` | `resolveTeamIds`, `listInstalledWorkflows`, `listRunGraphs` (fs) |
| Create `src/lib/workflows/__tests__/overview.test.ts` | Real temp-dir tests |
| Create `src/app/api/workflows/runs/route.ts` | `GET` runs endpoint |
| Create `src/app/api/__tests__/workflows-runs-route.test.ts` | Route tests |
| Create `src/components/workflows/RunGraphSvg.tsx` | SVG renderer (port of JIGGA `WorkflowGraph`) |
| Create `src/app/workflows/workflow-runs-client.tsx` | Polling runs list, node detail, approve |
| Create `src/app/workflows/page.tsx` | Server page: header, Installed, Runs |
| Modify `src/components/AppShell.tsx` | Nav entry + team-scoped route list |

---

### Task 0: Worktree dependencies

- [ ] **Step 1:** `cd ~/ClawKitchen-workflows-page && node -v && npm ci` — expect v22.x and a clean install.
- [ ] **Step 2:** `npx vitest run src/lib/workflows` — expect existing tests PASS (baseline).

---

### Task 1: `run-graph.ts` — merge topology with run state

**Files:**
- Create: `src/lib/workflows/run-graph.ts`
- Test: `src/lib/workflows/__tests__/run-graph.test.ts`

**Interfaces:**
- Produces: `GraphNodeStatus`, `GraphNode`, `GraphEdge`, `RunGraph`, `PlacedNode`, `buildRunGraph(input: BuildRunGraphInput): RunGraph`, `layoutGraph(nodes: GraphNode[]): { placed: PlacedNode[]; width: number; height: number }`, constants `NODE_W=168`, `NODE_H=56`, `GAP_X=76`, `GAP_Y=22`, `PAD=16`.

- [ ] **Step 1: Write the failing test** — `src/lib/workflows/__tests__/run-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  GAP_X,
  GAP_Y,
  NODE_H,
  NODE_W,
  PAD,
  buildRunGraph,
  layoutGraph,
  type GraphNode,
} from "@/lib/workflows/run-graph";

const RUN_ID = "2026-09-16t12-00-00-000z-abcd1234";

const workflow = {
  id: "wf",
  name: "WF",
  nodes: [
    { id: "start", type: "start" },
    { id: "draft", type: "llm", name: "Draft", config: { agentId: "team-writer" } },
    { id: "approval", type: "human_approval" },
    { id: "publish", kind: "tool", assignedTo: { agentId: "team-publisher" } },
    { id: "end", type: "end" },
  ],
  edges: [
    { id: "e1", from: "start", to: "draft" },
    { id: "e2", from: "draft", to: "approval" },
    { id: "e3", from: "approval", to: "publish", on: "success" },
    { id: "e4", from: "publish", to: "end" },
  ],
};

function runLog(status: string, nodeStates: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    status,
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:05:00.000Z",
    workflow: { id: "wf", name: "WF", file: "wf.workflow.json" },
    nodeStates,
  };
}

function build(run: unknown, opts: { workflow?: unknown; approval?: unknown } = {}) {
  return buildRunGraph({
    teamId: "team",
    runDirName: RUN_ID,
    run,
    workflow: "workflow" in opts ? opts.workflow : workflow,
    approval: opts.approval ?? null,
  });
}

const byId = (nodes: GraphNode[]) => Object.fromEntries(nodes.map((n) => [n.id, n]));

describe("buildRunGraph", () => {
  it("takes topology from the workflow file, in both node shapes", () => {
    const g = build(runLog("completed"));
    expect(g).toMatchObject({
      teamId: "team",
      runId: RUN_ID,
      workflowId: "wf",
      workflowName: "WF",
      status: "completed",
      createdAt: "2026-09-16T12:00:00.000Z",
      updatedAt: "2026-09-16T12:05:00.000Z",
    });
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "draft", "approval", "publish", "end"]);
    const n = byId(g.nodes);
    expect(n.draft).toMatchObject({ type: "llm", name: "Draft", agent: "team-writer" });
    expect(n.publish).toMatchObject({ type: "tool", name: null, agent: "team-publisher" });
    expect(g.edges).toEqual([
      { from: "start", to: "draft", on: "success" },
      { from: "draft", to: "approval", on: "success" },
      { from: "approval", to: "publish", on: "success" },
      { from: "publish", to: "end", on: "success" },
    ]);
  });

  it("colours nodes from nodeStates; unknown or absent states are pending", () => {
    const g = build(
      runLog("error", {
        start: { status: "success", ts: "2026-09-16T12:01:00.000Z" },
        draft: { status: "error", message: "boom" },
        approval: { status: "weird" },
      }),
    );
    const n = byId(g.nodes);
    expect(n.start).toMatchObject({ status: "success", ts: "2026-09-16T12:01:00.000Z" });
    expect(n.draft).toMatchObject({ status: "error", message: "boom" });
    expect(n.approval.status).toBe("pending");
    expect(n.end.status).toBe("pending");
  });

  it("marks the approval node from approval.json while it is pending", () => {
    const g = build(runLog("awaiting_approval", { start: { status: "success" }, draft: { status: "success" } }), {
      approval: { nodeId: "approval", status: "pending" },
    });
    expect(g.approvalNodeId).toBe("approval");
    expect(byId(g.nodes).approval.status).toBe("waiting");
  });

  it("has no approval node once the approval is decided", () => {
    const g = build(runLog("awaiting_approval", { approval: { status: "waiting" } }), {
      approval: { nodeId: "approval", status: "approved" },
    });
    expect(g.approvalNodeId).toBeNull();
  });

  it("falls back to the waiting node when there is no approval file", () => {
    const g = build(runLog("awaiting_approval", { approval: { status: "waiting" } }));
    expect(g.approvalNodeId).toBe("approval");
  });

  it("ignores approval data unless the run is awaiting approval", () => {
    const g = build(runLog("completed"), { approval: { nodeId: "approval", status: "pending" } });
    expect(g.approvalNodeId).toBeNull();
  });

  it("shows the next ready node as running on an active run", () => {
    const g = build(runLog("running", { start: { status: "success" } }));
    const n = byId(g.nodes);
    expect(n.draft.status).toBe("running");
    expect(n.approval.status).toBe("pending");
  });

  it("does not guess when the engine already reports a running node", () => {
    const g = build(runLog("running", { start: { status: "success" }, draft: { status: "running" } }));
    const n = byId(g.nodes);
    expect(n.draft.status).toBe("running");
    expect(n.approval.status).toBe("pending");
  });

  it("does not infer running nodes on a finished run", () => {
    const g = build(runLog("error", { start: { status: "success" } }));
    expect(byId(g.nodes).draft.status).toBe("pending");
  });

  it("builds a chain from nodeStates when the workflow file is missing", () => {
    const g = build(runLog("completed", { start: { status: "success" }, a: { status: "success" }, end: { status: "success" } }), {
      workflow: null,
    });
    expect(g.nodes.map((n) => [n.id, n.type])).toEqual([
      ["start", "node"],
      ["a", "node"],
      ["end", "node"],
    ]);
    expect(g.edges).toEqual([
      { from: "start", to: "a", on: "success" },
      { from: "a", to: "end", on: "success" },
    ]);
  });

  it("appends executed nodes that are no longer in the workflow file", () => {
    const g = build(runLog("completed", { start: { status: "success" }, old_step: { status: "success" } }));
    expect(g.nodes.at(-1)).toMatchObject({ id: "old_step", type: "node", status: "success" });
  });

  it("drops edges that point at unknown nodes", () => {
    const g = build(runLog("completed"), {
      workflow: { nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }, { from: "a", to: "ghost" }] },
    });
    expect(g.edges).toEqual([{ from: "a", to: "b", on: "success" }]);
  });

  it("uses longest-path depth", () => {
    const g = build(runLog("completed"), {
      workflow: {
        nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "a", to: "c" },
          { from: "c", to: "d" },
        ],
      },
    });
    expect(g.nodes.map((n) => [n.id, n.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
  });

  it("terminates on cycles", () => {
    const g = build(runLog("completed"), {
      workflow: {
        nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "b" },
        ],
      },
    });
    const n = byId(g.nodes);
    expect(n.a.depth).toBe(0);
    expect(Number.isFinite(n.b.depth) && Number.isFinite(n.c.depth)).toBe(true);
  });

  it("falls back to the run dir name and workflow file name for ids", () => {
    const g = buildRunGraph({
      teamId: "team",
      runDirName: RUN_ID,
      run: { status: "queued", workflow: { file: "nested/my-flow.workflow.json" } },
      workflow: { name: "My Flow", nodes: [], edges: [] },
      approval: null,
    });
    expect(g).toMatchObject({ runId: RUN_ID, workflowId: "my-flow", workflowName: "My Flow", createdAt: null });
  });
});

describe("layoutGraph", () => {
  it("places columns by depth and rows by order within a column", () => {
    const node = (id: string, depth: number): GraphNode => ({
      id, name: null, type: "node", agent: null, status: "pending", message: null, ts: null, depth,
    });
    const { placed, width, height } = layoutGraph([node("a", 0), node("b", 1), node("c", 1)]);
    expect(placed.map((p) => [p.id, p.x, p.y])).toEqual([
      ["a", PAD, PAD],
      ["b", PAD + NODE_W + GAP_X, PAD],
      ["c", PAD + NODE_W + GAP_X, PAD + NODE_H + GAP_Y],
    ]);
    expect(width).toBe(PAD + NODE_W + GAP_X + NODE_W + PAD);
    expect(height).toBe(PAD + 2 * NODE_H + GAP_Y + PAD);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/workflows/__tests__/run-graph.test.ts` — expect FAIL (cannot resolve `@/lib/workflows/run-graph`).

- [ ] **Step 3: Implement** — `src/lib/workflows/run-graph.ts`:

```ts
/**
 * A workflow run as the graph it is: the workflow file's nodes and edges,
 * coloured by the run's `nodeStates`. The run log has no topology of its own,
 * so the two have to be merged. Pure — `overview.ts` does the file reads.
 */

export type GraphNodeStatus = "pending" | "running" | "waiting" | "success" | "error" | "skipped";

export type GraphNode = {
  id: string;
  name: string | null;
  type: string;
  agent: string | null;
  status: GraphNodeStatus;
  message: string | null;
  ts: string | null;
  depth: number;
};

export type GraphEdge = { from: string; to: string; on: string };

export type RunGraph = {
  teamId: string;
  runId: string;
  workflowId: string;
  workflowName: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Set only while the run is awaiting a decision on this node. */
  approvalNodeId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type BuildRunGraphInput = {
  teamId: string;
  runDirName: string;
  run: unknown;
  workflow: unknown;
  approval: unknown;
};

type Obj = Record<string, unknown>;
type NodeShape = Pick<GraphNode, "id" | "name" | "type" | "agent">;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// Started and neither parked nor finished — the only runs where "next node is
// running" is a safe guess. `queued` has not been claimed yet.
const ACTIVE_RUN_STATUSES = new Set(["running", "waiting_workers"]);

const STATE_TO_STATUS: Record<string, GraphNodeStatus> = {
  success: "success",
  completed: "success",
  error: "error",
  waiting: "waiting",
  awaiting_approval: "waiting",
  running: "running",
  skipped: "skipped",
};

function shapeFromWorkflow(workflow: unknown): { nodes: NodeShape[]; edges: GraphEdge[] } {
  const wf = obj(workflow);
  const rawNodes: unknown[] = wf && Array.isArray(wf.nodes) ? wf.nodes : [];
  const rawEdges: unknown[] = wf && Array.isArray(wf.edges) ? wf.edges : [];

  const nodes: NodeShape[] = [];
  const ids = new Set<string>();
  for (const raw of rawNodes) {
    const n = obj(raw);
    const id = str(n?.id);
    if (!n || !id || ids.has(id)) continue;
    ids.add(id);
    // Kitchen writes type/config.agentId; the runner's own format is kind/assignedTo.
    nodes.push({
      id,
      name: str(n.name),
      type: str(n.type) ?? str(n.kind) ?? "node",
      agent: str(obj(n.config)?.agentId) ?? str(obj(n.assignedTo)?.agentId),
    });
  }

  const edges: GraphEdge[] = [];
  for (const raw of rawEdges) {
    const e = obj(raw);
    const from = str(e?.from);
    const to = str(e?.to);
    if (!e || !from || !to || !ids.has(from) || !ids.has(to)) continue;
    edges.push({ from, to, on: str(e.on) ?? "success" });
  }
  return { nodes, edges };
}

function bareNode(id: string): NodeShape {
  return { id, name: null, type: "node", agent: null };
}

function findApprovalNode(runStatus: string, approval: unknown, nodes: GraphNode[]): string | null {
  if (runStatus !== "awaiting_approval") return null;
  const a = obj(approval);
  const fileNodeId = str(a?.nodeId);
  if (fileNodeId) {
    const decision = str(a?.status) ?? str(a?.state);
    // Decided but not yet resumed: offering the buttons again would double-decide.
    if (decision && decision !== "pending") return null;
    if (nodes.some((n) => n.id === fileNodeId)) return fileNodeId;
  }
  return nodes.find((n) => n.status === "waiting")?.id ?? null;
}

function markReadyNodesRunning(nodes: GraphNode[], edges: GraphEdge[]) {
  if (nodes.some((n) => n.status === "running")) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    if (node.status !== "pending") continue;
    const preds = edges.filter((e) => e.to === node.id && e.on !== "error").map((e) => byId.get(e.from));
    if (preds.length && preds.every((p) => p?.status === "success")) node.status = "running";
  }
}

function computeDepths(ids: string[], edges: GraphEdge[]): Map<string, number> {
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) preds.get(e.to)?.push(e.from);

  const depth = new Map<string, number>();
  const onStack = new Set<string>();
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    onStack.add(id);
    let d = 0;
    for (const p of preds.get(id) ?? []) {
      // A back edge (revision loop) must not push its target right forever.
      if (onStack.has(p)) continue;
      d = Math.max(d, visit(p) + 1);
    }
    onStack.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of ids) visit(id);
  return depth;
}

function workflowIdFromFile(file: string | null): string | null {
  if (!file) return null;
  const base = file.split("/").pop() ?? "";
  return str(base.replace(/\.workflow\.json$/i, ""));
}

export function buildRunGraph(input: BuildRunGraphInput): RunGraph {
  const run = obj(input.run) ?? {};
  const ref = obj(run.workflow) ?? {};
  const states = obj(run.nodeStates) ?? {};
  const status = str(run.status) ?? "unknown";

  const shape = shapeFromWorkflow(input.workflow);
  const stateIds = Object.keys(states);
  if (shape.nodes.length === 0) {
    shape.nodes = stateIds.map(bareNode);
    shape.edges = stateIds.slice(1).map((id, i) => ({ from: stateIds[i], to: id, on: "success" }));
  } else {
    const known = new Set(shape.nodes.map((n) => n.id));
    for (const id of stateIds) if (!known.has(id)) shape.nodes.push(bareNode(id));
  }

  const nodes: GraphNode[] = shape.nodes.map((n) => {
    const st = obj(states[n.id]);
    return {
      ...n,
      status: STATE_TO_STATUS[str(st?.status) ?? ""] ?? "pending",
      message: str(st?.message),
      ts: str(st?.ts),
      depth: 0,
    };
  });

  const approvalNodeId = findApprovalNode(status, input.approval, nodes);
  const approvalNode = nodes.find((n) => n.id === approvalNodeId);
  if (approvalNode && approvalNode.status === "pending") approvalNode.status = "waiting";
  if (ACTIVE_RUN_STATUSES.has(status)) markReadyNodesRunning(nodes, shape.edges);

  const depths = computeDepths(nodes.map((n) => n.id), shape.edges);
  for (const n of nodes) n.depth = depths.get(n.id) ?? 0;

  return {
    teamId: input.teamId,
    runId: str(run.runId) ?? input.runDirName,
    workflowId: str(ref.id) ?? workflowIdFromFile(str(ref.file)) ?? "(unknown)",
    workflowName: str(ref.name) ?? str(obj(input.workflow)?.name),
    status,
    createdAt: str(run.createdAt),
    updatedAt: str(run.updatedAt),
    approvalNodeId,
    nodes,
    edges: shape.edges,
  };
}

export const NODE_W = 168;
export const NODE_H = 56;
export const GAP_X = 76;
export const GAP_Y = 22;
export const PAD = 16;

export type PlacedNode = GraphNode & { x: number; y: number };

/** Columns by depth, rows by order within a depth. */
export function layoutGraph(nodes: GraphNode[]): { placed: PlacedNode[]; width: number; height: number } {
  const rows = new Map<number, number>();
  const placed = nodes.map((node) => {
    const row = rows.get(node.depth) ?? 0;
    rows.set(node.depth, row + 1);
    return { ...node, x: PAD + node.depth * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y) };
  });
  const width = Math.max(200, ...placed.map((n) => n.x + NODE_W)) + PAD;
  const height = Math.max(80, ...placed.map((n) => n.y + NODE_H)) + PAD;
  return { placed, width, height };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/workflows/__tests__/run-graph.test.ts` — expect all PASS.
- [ ] **Step 5:** `npx eslint src/lib/workflows/run-graph.ts src/lib/workflows/__tests__/run-graph.test.ts` — expect clean.
- [ ] **Step 6: Commit** — `git add src/lib/workflows/run-graph.ts src/lib/workflows/__tests__/run-graph.test.ts && git commit -m "feat(workflows): merge a run's node states onto its workflow graph"`

---

### Task 2: `overview.ts` + `GET /api/workflows/runs`

**Files:**
- Create: `src/lib/workflows/overview.ts`, `src/app/api/workflows/runs/route.ts`
- Test: `src/lib/workflows/__tests__/overview.test.ts`, `src/app/api/__tests__/workflows-runs-route.test.ts`

**Interfaces:**
- Consumes: `buildRunGraph`, `RunGraph` (Task 1); `getTeamWorkspaceDir(teamId): Promise<string>` (`@/lib/paths`); `readManifest(): Promise<KitchenManifest | null>` (`@/lib/manifest`); `listLocalTeamIds(): Promise<string[]>` (`@/lib/teams`); `errorMessage(e: unknown): string` (`@/lib/errors`).
- Produces: `resolveTeamIds(team: string | null | undefined): Promise<string[]>` (throws `"Invalid team id"`); `listInstalledWorkflows(teamIds: string[]): Promise<InstalledWorkflow[]>` with `InstalledWorkflow = { teamId: string; id: string; name: string | null; nodeCount: number; cron: string[] }`; `listRunGraphs(opts: { teamIds: string[]; limit: number }): Promise<{ runs: RunGraph[]; total: number }>`; `GET /api/workflows/runs?team=&limit=` → `{ ok: true, runs: RunGraph[], total: number }` | `{ ok: false, error }` (400 invalid team, 500 otherwise).

- [ ] **Step 1: Write the failing tests** — `src/lib/workflows/__tests__/overview.test.ts`:

```ts
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
```

`src/app/api/__tests__/workflows-runs-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workflows/overview", () => ({
  resolveTeamIds: vi.fn(),
  listRunGraphs: vi.fn(),
}));

import { listRunGraphs, resolveTeamIds } from "@/lib/workflows/overview";
import { GET } from "../workflows/runs/route";

describe("api workflows runs route", () => {
  beforeEach(() => {
    vi.mocked(resolveTeamIds).mockReset().mockResolvedValue(["alpha"]);
    vi.mocked(listRunGraphs).mockReset().mockResolvedValue({ runs: [], total: 0 });
  });

  it("defaults the limit to 20 and passes the team through", async () => {
    const res = await GET(new Request("https://test/api/workflows/runs?team=alpha"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, runs: [], total: 0 });
    expect(resolveTeamIds).toHaveBeenCalledWith("alpha");
    expect(listRunGraphs).toHaveBeenCalledWith({ teamIds: ["alpha"], limit: 20 });
  });

  it.each([
    ["0", 1],
    ["45.9", 45],
    ["9999", 200],
    ["abc", 20],
  ])("clamps limit=%s to %d", async (raw, expected) => {
    await GET(new Request(`https://test/api/workflows/runs?limit=${raw}`));
    expect(listRunGraphs).toHaveBeenCalledWith({ teamIds: ["alpha"], limit: expected });
  });

  it("returns 400 for an invalid team", async () => {
    vi.mocked(resolveTeamIds).mockRejectedValueOnce(new Error("Invalid team id"));
    const res = await GET(new Request("https://test/api/workflows/runs?team=../x"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid team id" });
  });

  it("returns 500 when listing fails", async () => {
    vi.mocked(listRunGraphs).mockRejectedValueOnce(new Error("disk gone"));
    const res = await GET(new Request("https://test/api/workflows/runs"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "disk gone" });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/workflows/__tests__/overview.test.ts src/app/api/__tests__/workflows-runs-route.test.ts` — expect FAIL (modules not found).

- [ ] **Step 3: Implement** — `src/lib/workflows/overview.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { readManifest } from "@/lib/manifest";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { listLocalTeamIds } from "@/lib/teams";
import { buildRunGraph, type RunGraph } from "@/lib/workflows/run-graph";

/** Data for the all-teams /workflows page, read straight from team workspaces. */

const RUNS_DIR = path.join("shared-context", "workflow-runs");
const WORKFLOWS_DIR = path.join("shared-context", "workflows");
const WORKFLOW_SUFFIX = ".workflow.json";
const TEAM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/;

export type InstalledWorkflow = {
  teamId: string;
  id: string;
  name: string | null;
  nodeCount: number;
  cron: string[];
};

type RunEntry = { teamId: string; teamDir: string; name: string; run: Record<string, unknown> };

async function readJsonOrNull(p: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function resolveTeamIds(team: string | null | undefined): Promise<string[]> {
  const requested = String(team ?? "").trim();
  if (requested) {
    if (!TEAM_ID_RE.test(requested)) throw new Error("Invalid team id");
    return [requested];
  }
  const manifest = await readManifest();
  return manifest ? Object.keys(manifest.teams).sort() : listLocalTeamIds();
}

function cronExprs(triggers: unknown): string[] {
  if (!Array.isArray(triggers)) return [];
  const out: string[] = [];
  for (const t of triggers) {
    if (!isObject(t) || t.kind !== "cron" || t.enabled === false) continue;
    const expr = typeof t.expr === "string" ? t.expr : t.cron;
    if (typeof expr === "string" && expr.trim()) out.push(expr);
  }
  return out;
}

async function listTeamWorkflows(teamId: string): Promise<InstalledWorkflow[]> {
  const dir = path.join(await getTeamWorkspaceDir(teamId), WORKFLOWS_DIR);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(WORKFLOW_SUFFIX));
  } catch {
    return [];
  }
  const items = await Promise.all(
    files.map(async (file): Promise<InstalledWorkflow | null> => {
      const wf = await readJsonOrNull(path.join(dir, file));
      if (!isObject(wf)) return null;
      return {
        teamId,
        id: file.slice(0, -WORKFLOW_SUFFIX.length),
        name: typeof wf.name === "string" && wf.name.trim() ? wf.name : null,
        nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
        cron: cronExprs(wf.triggers),
      };
    }),
  );
  return items.filter((x): x is InstalledWorkflow => x !== null);
}

export async function listInstalledWorkflows(teamIds: string[]): Promise<InstalledWorkflow[]> {
  const perTeam = await Promise.all(teamIds.map(listTeamWorkflows));
  return perTeam.flat().sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

async function listTeamRuns(teamId: string): Promise<RunEntry[]> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const runsDir = path.join(teamDir, RUNS_DIR);
  let names: string[];
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    names.map(async (name): Promise<RunEntry | null> => {
      const run = await readJsonOrNull(path.join(runsDir, name, "run.json"));
      return isObject(run) ? { teamId, teamDir, name, run } : null;
    }),
  );
  return entries.filter((e): e is RunEntry => e !== null);
}

// A run waiting on a person is the one this page exists for — however old it is.
function compareRuns(a: RunEntry, b: RunEntry): number {
  const aWaiting = a.run.status === "awaiting_approval";
  const bWaiting = b.run.status === "awaiting_approval";
  if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
  // Runner ids start with an ISO timestamp, so name order is start order.
  if (a.name !== b.name) return a.name < b.name ? 1 : -1;
  return a.teamId.localeCompare(b.teamId);
}

function workflowFileName(run: Record<string, unknown>): string | null {
  const ref = isObject(run.workflow) ? run.workflow : null;
  if (typeof ref?.file !== "string") return null;
  const base = path.basename(ref.file);
  return base.endsWith(WORKFLOW_SUFFIX) ? base : null;
}

export async function listRunGraphs(opts: { teamIds: string[]; limit: number }): Promise<{ runs: RunGraph[]; total: number }> {
  const all = (await Promise.all(opts.teamIds.map(listTeamRuns))).flat().sort(compareRuns);
  const page = all.slice(0, opts.limit);

  const workflows = new Map<string, Promise<unknown>>();
  const loadWorkflow = (entry: RunEntry): Promise<unknown> => {
    const file = workflowFileName(entry.run);
    if (!file) return Promise.resolve(null);
    const p = path.join(entry.teamDir, WORKFLOWS_DIR, file);
    let pending = workflows.get(p);
    if (!pending) {
      pending = readJsonOrNull(p);
      workflows.set(p, pending);
    }
    return pending;
  };

  const runs = await Promise.all(
    page.map(async (entry) => {
      const [workflow, approval] = await Promise.all([
        loadWorkflow(entry),
        readJsonOrNull(path.join(entry.teamDir, RUNS_DIR, entry.name, "approvals", "approval.json")),
      ]);
      return buildRunGraph({ teamId: entry.teamId, runDirName: entry.name, run: entry.run, workflow, approval });
    }),
  );
  return { runs, total: all.length };
}
```

`src/app/api/workflows/runs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { listRunGraphs, resolveTeamIds } from "@/lib/workflows/overview";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  let teamIds: string[];
  try {
    teamIds = await resolveTeamIds(url.searchParams.get("team"));
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 400 });
  }

  try {
    const { runs, total } = await listRunGraphs({ teamIds, limit: parseLimit(url.searchParams.get("limit")) });
    return NextResponse.json({ ok: true, runs, total });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
```

- [ ] **Step 4:** `npx vitest run src/lib/workflows/__tests__/overview.test.ts src/app/api/__tests__/workflows-runs-route.test.ts` — expect all PASS.
- [ ] **Step 5:** `npx eslint src/lib/workflows/overview.ts src/app/api/workflows/runs/route.ts src/lib/workflows/__tests__/overview.test.ts src/app/api/__tests__/workflows-runs-route.test.ts` — expect clean.
- [ ] **Step 6: Commit** — `git add` the four files; `git commit -m "feat(workflows): all-teams runs endpoint with approvals pinned first"`

---

### Task 3: Graph renderer, runs client, page, nav

**Files:**
- Create: `src/components/workflows/RunGraphSvg.tsx`, `src/app/workflows/workflow-runs-client.tsx`, `src/app/workflows/page.tsx`
- Modify: `src/components/AppShell.tsx` (`navHref` / `syncTeamToCurrentUrl` route checks; `globalNav` array before the Runs entry)

**Interfaces:**
- Consumes: `RunGraph`, `GraphNode`, `GraphNodeStatus`, `PlacedNode`, `layoutGraph`, `NODE_W`, `NODE_H` (Task 1); `resolveTeamIds`, `listInstalledWorkflows` (Task 2); `GET /api/workflows/runs` (Task 2); `fetchJson<T>(url, opts?)` (`@/lib/fetch-json`); `errorMessage` (`@/lib/errors`); `readManifest` (`@/lib/manifest`); existing `POST /api/teams/workflow-runs` → `{ ok: true, resumeError?: string }`.
- Produces: `default RunGraphSvg({ run, selected, onSelect })`, `default WorkflowRunsClient({ team, teamNames })`, route `/workflows`.

- [ ] **Step 1:** Create `src/components/workflows/RunGraphSvg.tsx`:

```tsx
"use client";

import {
  NODE_H,
  NODE_W,
  layoutGraph,
  type GraphNodeStatus,
  type PlacedNode,
  type RunGraph,
} from "@/lib/workflows/run-graph";

/**
 * A run drawn as its graph (ported from JIGGA's jiggaview). Plain SVG — the
 * graphs are small, and a layout library is a poor trade for one screen.
 */

// Past this, scaling to fit makes labels unreadable, so scroll instead.
const FIT_WIDTH_LIMIT = 1400;
const BACK_EDGE_DROP = 28;

const STATUS_FILL: Record<GraphNodeStatus, string> = {
  success: "rgba(16,185,129,0.16)",
  running: "rgba(56,189,248,0.20)",
  waiting: "rgba(245,158,11,0.22)",
  error: "rgba(239,68,68,0.20)",
  skipped: "rgba(255,255,255,0.05)",
  pending: "rgba(255,255,255,0.06)",
};

const STATUS_STROKE: Record<GraphNodeStatus, string> = {
  success: "rgba(16,185,129,0.55)",
  running: "rgba(56,189,248,0.75)",
  waiting: "rgba(245,158,11,0.85)",
  error: "rgba(239,68,68,0.7)",
  skipped: "rgba(255,255,255,0.15)",
  pending: "rgba(255,255,255,0.18)",
};

function edgePath(from: PlacedNode, to: PlacedNode): string {
  if (to.x <= from.x) {
    // A loop back (revision): arc underneath instead of crossing the row.
    const fx = from.x + NODE_W / 2;
    const tx = to.x + NODE_W / 2;
    const drop = Math.max(from.y, to.y) + NODE_H + BACK_EDGE_DROP - 6;
    return `M ${fx} ${from.y + NODE_H} C ${fx} ${drop}, ${tx} ${drop}, ${tx} ${to.y + NODE_H}`;
  }
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function short(text: string, max = 22): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function subtitle(node: PlacedNode): string {
  if (node.type === "human_approval") return "approval";
  return node.agent ?? node.type;
}

export default function RunGraphSvg({
  run,
  selected,
  onSelect,
}: {
  run: RunGraph;
  selected: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const { placed, width, height: baseHeight } = layoutGraph(run.nodes);
  const byId = new Map(placed.map((node) => [node.id, node]));
  const hasBackEdge = run.edges.some((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    return !!from && !!to && to.x <= from.x;
  });
  const height = baseHeight + (hasBackEdge ? BACK_EDGE_DROP : 0);
  const scrollable = width > FIT_WIDTH_LIMIT;
  // Many graphs share the page; marker ids must not collide.
  const markerId = `wf-arrow-${run.teamId}-${run.runId}`;

  return (
    <div className={scrollable ? "overflow-x-auto" : ""}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={scrollable ? width : undefined}
        height={scrollable ? height : undefined}
        style={scrollable ? undefined : { width: "100%", maxWidth: width, height: "auto" }}
        role="img"
        aria-label={`Workflow ${run.workflowId}, run ${run.runId}`}
      >
        <defs>
          <marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="rgba(255,255,255,0.35)" />
          </marker>
          <marker id={`${markerId}-error`} markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="rgba(239,68,68,0.6)" />
          </marker>
        </defs>

        {run.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const isError = edge.on === "error";
          const arrowId = isError ? `${markerId}-error` : markerId;
          return (
            <path
              key={`${edge.from}->${edge.to}:${edge.on}`}
              d={edgePath(from, to)}
              fill="none"
              stroke={isError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.25)"}
              strokeWidth={1.5}
              strokeDasharray={isError ? "5 4" : undefined}
              markerEnd={`url(#${arrowId})`}
            />
          );
        })}

        {placed.map((node) => {
          const isSelected = selected === node.id;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${node.name ?? node.id}: ${node.status}`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(node.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={STATUS_FILL[node.status]}
                stroke={isSelected ? "rgba(255,255,255,0.9)" : STATUS_STROKE[node.status]}
                strokeWidth={isSelected ? 2 : 1.25}
              />
              {node.status === "running" ? (
                <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={10} fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth={2}>
                  <animate attributeName="opacity" values="0.15;1;0.15" dur="1.6s" repeatCount="indefinite" />
                </rect>
              ) : null}
              <text x={node.x + 12} y={node.y + 22} fontSize="12" fill="currentColor">
                {short(node.name ?? node.id)}
              </text>
              <text x={node.x + 12} y={node.y + 40} fontSize="10" fill="currentColor" opacity="0.65">
                {short(subtitle(node), 26)}
              </text>
              {node.status === "waiting" ? (
                <text x={node.x + NODE_W - 12} y={node.y + 18} fontSize="14" textAnchor="end">
                  ⏸
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2:** Create `src/app/workflows/workflow-runs-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RunGraphSvg from "@/components/workflows/RunGraphSvg";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import type { GraphNode, RunGraph } from "@/lib/workflows/run-graph";

/**
 * Every run, drawn as its graph. A run waiting on a person is the case this
 * exists for, so the approval is answerable here.
 */

const POLL_MS = 5000;
const PAGE_SIZE = 20;
const MAX_LIMIT = 200;

type RunsResponse = { ok: true; runs: RunGraph[]; total: number };
type DecideResponse = { ok: true; resumeError?: string };
type Decision = "approve" | "request_changes";

const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

const ACTIVE = new Set(["running", "queued", "waiting_workers"]);
const WAITING = new Set(["awaiting_approval", "waiting", "needs_revision", "waiting_handoff"]);
const FAILED = new Set(["error", "rejected"]);
const DONE = new Set(["completed", "success"]);

function statusPill(status: string): string {
  if (ACTIVE.has(status)) return "bg-sky-500/20 text-sky-200";
  if (WAITING.has(status)) return "bg-amber-500/20 text-amber-200";
  if (FAILED.has(status)) return "bg-red-500/20 text-red-200";
  if (DONE.has(status)) return "bg-emerald-500/20 text-emerald-300";
  return "bg-white/10 text-[color:var(--ck-text-secondary)]";
}

function human(status: string): string {
  return status.replace(/_/g, " ");
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function runKey(run: RunGraph): string {
  return `${run.teamId}/${run.runId}`;
}

function decisionNotice(run: RunGraph, node: GraphNode, action: Decision, out: DecideResponse): string {
  if (out.resumeError) return `Recorded, but the run did not resume: ${out.resumeError}`;
  if (action === "approve") return `Approved ${node.name ?? node.id} — resuming ${run.workflowName ?? run.workflowId}.`;
  return `Changes requested on ${node.name ?? node.id}.`;
}

function NodeDetail({
  run,
  node,
  busy,
  onDecide,
}: {
  run: RunGraph;
  node: GraphNode;
  busy: boolean;
  onDecide: (action: Decision) => void;
}) {
  const canDecide = run.status === "awaiting_approval" && run.approvalNodeId === node.id;
  const meta = [node.name ? node.id : null, node.type, node.agent].filter(Boolean).join(" · ");
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{node.name ?? node.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(node.status)}`}>{human(node.status)}</span>
        <span className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">{meta}</span>
        {node.ts ? <span className="text-xs text-[color:var(--ck-text-tertiary)]">{when(node.ts)}</span> : null}
      </div>
      {node.message ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[color:var(--ck-text-secondary)]">{node.message}</p>
      ) : null}
      {canDecide ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => onDecide("approve")}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onDecide("request_changes")}>
            Request changes
          </button>
          <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">The run resumes once the decision is recorded.</span>
        </div>
      ) : null}
    </div>
  );
}

function RunCard({
  run,
  teamName,
  selectedId,
  busy,
  onSelect,
  onDecide,
}: {
  run: RunGraph;
  teamName: string;
  selectedId: string | null;
  busy: boolean;
  onSelect: (nodeId: string) => void;
  onDecide: (node: GraphNode, action: Decision) => void;
}) {
  // Follow the interesting node unless someone picked one.
  const auto = run.nodes.find((n) => n.status === "running") ?? run.nodes.find((n) => n.id === run.approvalNodeId);
  const currentId = selectedId ?? auto?.id ?? null;
  const node = run.nodes.find((n) => n.id === currentId) ?? null;
  const runHref = `/teams/${encodeURIComponent(run.teamId)}/runs/${encodeURIComponent(run.workflowId)}/${encodeURIComponent(run.runId)}`;
  const updated = run.updatedAt && run.updatedAt !== run.createdAt ? ` → ${when(run.updatedAt)}` : "";

  return (
    <div className="ck-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{run.workflowName ?? run.workflowId}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(run.status)}`}>{human(run.status)}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">{teamName}</span>
          </div>
          <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
            {when(run.createdAt)}
            {updated}
          </div>
        </div>
        <Link href={runHref} className="shrink-0 text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          open run →
        </Link>
      </div>

      <div className="mt-3">
        <RunGraphSvg run={run} selected={currentId} onSelect={onSelect} />
      </div>

      {node ? <NodeDetail run={run} node={node} busy={busy} onDecide={(action) => onDecide(node, action)} /> : null}
    </div>
  );
}

export default function WorkflowRunsClient({ team, teamNames }: { team: string; teamNames: Record<string, string> }) {
  const [runs, setRuns] = useState<RunGraph[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return; // don't overwrite an in-flight decision
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (team) qs.set("team", team);
      const out = await fetchJson<RunsResponse>(`/api/workflows/runs?${qs.toString()}`, { cache: "no-store" });
      setRuns(out.runs);
      setTotal(out.total);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [team, limit]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function decide(run: RunGraph, node: GraphNode, action: Decision) {
    busyRef.current = true;
    setBusyKey(runKey(run));
    setNotice(null);
    try {
      const out = await fetchJson<DecideResponse>("/api/teams/workflow-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: run.teamId, workflowId: run.workflowId, runId: run.runId, action }),
      });
      setNotice(decisionNotice(run, node, action, out));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusyKey("");
      await load();
    }
  }

  if (loading) {
    return <p className="mt-3 text-sm text-[color:var(--ck-text-tertiary)]">Loading runs…</p>;
  }

  return (
    <div className="mt-3 space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div>
      ) : null}

      {runs.length === 0 ? (
        <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
          No runs yet. Start one from a team&apos;s Workflows tab, or let a cron trigger fire it.
        </div>
      ) : null}

      {runs.map((run) => (
        <RunCard
          key={runKey(run)}
          run={run}
          teamName={teamNames[run.teamId] ?? run.teamId}
          selectedId={selected[runKey(run)] ?? null}
          busy={busyKey === runKey(run)}
          onSelect={(nodeId) => setSelected((prev) => ({ ...prev, [runKey(run)]: nodeId }))}
          onDecide={(node, action) => void decide(run, node, action)}
        />
      ))}

      {runs.length < total && limit < MAX_LIMIT ? (
        <button type="button" className={secondaryBtn} onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}>
          Load more ({runs.length} of {total})
        </button>
      ) : null}
      {runs.length < total && limit >= MAX_LIMIT ? (
        <p className="text-xs text-[color:var(--ck-text-tertiary)]">
          Showing the newest {runs.length} of {total}. See <Link href="/runs" className="hover:underline">Runs</Link> for the full history.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3:** Create `src/app/workflows/page.tsx`:

```tsx
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { errorMessage } from "@/lib/errors";
import { readManifest } from "@/lib/manifest";
import { listInstalledWorkflows, resolveTeamIds } from "@/lib/workflows/overview";
import WorkflowRunsClient from "./workflow-runs-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-[color:var(--ck-text-tertiary)]";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const sp = await searchParams;
  const team = String((Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "").trim();

  let teamIds: string[] = [];
  let error: string | null = null;
  try {
    teamIds = await resolveTeamIds(team);
  } catch (e) {
    error = errorMessage(e);
  }

  const [installed, manifest] = await Promise.all([listInstalledWorkflows(teamIds), readManifest()]);
  const teamNames: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest?.teams ?? {})) {
    if (entry.displayName) teamNames[id] = entry.displayName;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          {team ? `${teamNames[team] ?? team} · ` : "All teams · "}
          Every run drawn as the graph it is. A node waiting on you can be answered here.
        </p>
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      </div>

      <section>
        <h2 className={sectionTitle}>Installed</h2>
        {installed.length === 0 ? (
          <div className="ck-card mt-3 p-4 text-sm text-[color:var(--ck-text-tertiary)]">
            No workflows yet. Create one from a team&apos;s Workflows tab.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {installed.map((wf) => (
              <Link
                key={`${wf.teamId}/${wf.id}`}
                href={`/teams/${encodeURIComponent(wf.teamId)}/workflows/${encodeURIComponent(wf.id)}`}
                className="ck-card block p-4 transition-colors hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{wf.name ?? wf.id}</div>
                    <div className="truncate font-mono text-xs text-[color:var(--ck-text-tertiary)]">{wf.id}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
                    {wf.nodeCount} nodes
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--ck-text-tertiary)]">
                  <span>{teamNames[wf.teamId] ?? wf.teamId}</span>
                  {wf.cron.map((expr) => (
                    <span key={expr} className="font-mono">
                      cron {expr}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className={sectionTitle}>Runs</h2>
        <WorkflowRunsClient team={team} teamNames={teamNames} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Nav** — in `src/components/AppShell.tsx`, above `function navHref`, add:

```ts
  // Pages that read ?team= — the nav carries the selected team to these.
  const TEAM_SCOPED_ROUTES = ["/tickets", "/goals", "/cron-jobs", "/runs", "/workflows"];
```

Replace in `navHref`:
```ts
    if (href === "/tickets" || href === "/goals" || href === "/cron-jobs" || href === "/runs") {
```
with
```ts
    if (TEAM_SCOPED_ROUTES.includes(href)) {
```
Replace in `syncTeamToCurrentUrl`:
```ts
    if (pathname !== "/tickets" && pathname !== "/goals" && pathname !== "/cron-jobs" && pathname !== "/runs") return;
```
with
```ts
    if (!TEAM_SCOPED_ROUTES.includes(pathname)) return;
```
(Implemented at module scope, as the fallback allows.) In `globalNav`, insert before the `navHref(\`/runs\`)` entry:
```tsx
    {
      href: navHref(`/workflows`),
      label: "Workflows",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="5" r="2" />
            <circle cx="18" cy="5" r="2" />
            <circle cx="12" cy="19" r="2" />
            <path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7" />
            <path d="M12 12v5" />
          </svg>
        </Icon>
      ),
    },
```
If `TEAM_SCOPED_ROUTES` is flagged by `react-hooks/exhaustive-deps` in any hook, move it to module scope above the component instead.

- [ ] **Step 5:** `npx eslint src/components/workflows src/app/workflows src/components/AppShell.tsx && npx tsc --noEmit -p .` — expect clean.
- [ ] **Step 6: Commit** — `git add src/components/workflows/RunGraphSvg.tsx src/app/workflows/page.tsx src/app/workflows/workflow-runs-client.tsx src/components/AppShell.tsx && git commit -m "feat(workflows): all-teams Workflows page with runs drawn as graphs"`

---

### Task 4: Verify end to end and open the PR

- [ ] **Step 1:** `npm run lint && npm run test:run` — expect all pass (report counts).
- [ ] **Step 2:** `npm run build` — expect success (in the worktree only).
- [ ] **Step 3:** Serve the build on a spare local port, not exposed: `PORT=4199 HOSTNAME=127.0.0.1 node .next/standalone/server.js` (or `npx next start -H 127.0.0.1 -p 4199` if standalone is unavailable), run in background. `curl -s 'http://127.0.0.1:4199/api/workflows/runs?limit=3' | jq '.total, [.runs[] | {teamId, runId, status, approvalNodeId, nodes: (.nodes|length)}]'` — expect total ≈ 258 and the two `awaiting_approval` runs first.
- [ ] **Step 4:** Playwright: open `http://127.0.0.1:4199/workflows`; full-page screenshot; check Installed cards count (31 on HMX), graphs render, clicking a node changes the detail panel, Load more increases the count, team selector adds `?team=`. Screenshot at 1200 and 1440 widths.
- [ ] **Step 5:** Approve wiring without touching HMX: in Playwright, `page.route("**/api/teams/workflow-runs", ...)` to capture the request body and fulfil `{ ok: true, resumed: true }`; click Approve on a waiting run; assert body `{teamId, workflowId, runId, action: "approve"}` and the notice. Repeat for Request changes. Confirm on disk that the two waiting runs' `approval.json` / `run.json` mtimes are unchanged.
- [ ] **Step 6:** Stop the server. `git push -u origin feat/workflows-page` and `gh pr create --base main` with a summary, test results, screenshots, and the attribution footer. Do not merge.
