# Dashboard Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-rendered `/dashboard` in ClawKitchen showing what the install is and what it is doing, read from files.

**Architecture:** Pure derivations (`activity.ts`) over data loaded by `overview.ts` (manifest, run graphs from the Workflows page lib, queue files, Kitchen plugins). Server-component panels render it.

**Tech Stack:** Next 16 App Router, React 19, TypeScript, Tailwind v4 + `--ck-*` tokens, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-21-dashboard-page-design.md`

## Global Constraints

- Worktree `~/ClawKitchen-dashboard`, branch `feat/dashboard-page` (on top of `feat/workflows-page`). PR `--base main`. Never build or check out in `~/ClawKitchen`.
- No CLI calls, no new dependencies, no ClawRecipes changes.
- `now` is computed in `loadDashboard`, not in a component body.
- Thresholds: claim lease default 3600 s; stalled queue > 1 h; stale approval > 24 h; failed runs within 24 h; manifest > 1 h.
- Node 22.

---

### Task 0: Worktree deps

- [ ] `cd ~/ClawKitchen-dashboard && npm ci && npx vitest run src/lib/workflows` — expect PASS.

---

### Task 1: `activity.ts`

**Files:** Create `src/lib/dashboard/activity.ts`; Test `src/lib/dashboard/__tests__/activity.test.ts`

**Interfaces:**
- Consumes: `RunGraph`, `GraphNodeStatus` (`@/lib/workflows/run-graph`); `KitchenManifest` (`@/lib/manifest`).
- Produces: `QueueTask`, `QueueClaim`, `AgentQueue`, `WorkItem`, `LastSeen`, `Attention`, `TeamSummary`, `DEFAULT_CLAIM_LEASE_SECONDS`, `ago(iso, now)`, `isClaimLive(claim, now)`, `workingNow(queues, runs, now)`, `lastSeenByAgent(runs)`, `needsAttention({runs, queues, manifestGeneratedAt, now})`, `teamSummaries(manifest)`.

- [ ] **Step 1: failing test** — `src/lib/dashboard/__tests__/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ago,
  isClaimLive,
  lastSeenByAgent,
  needsAttention,
  teamSummaries,
  workingNow,
  type AgentQueue,
} from "@/lib/dashboard/activity";
import type { KitchenManifest } from "@/lib/manifest";
import type { GraphNode, RunGraph } from "@/lib/workflows/run-graph";

const NOW = Date.parse("2026-09-21T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function node(id: string, agent: string | null, status: GraphNode["status"], ts: string | null = null): GraphNode {
  return { id, name: null, type: "llm", agent, status, message: null, ts, depth: 0 };
}

function run(runId: string, status: string, nodes: GraphNode[], updatedAt: string | null = minutesAgo(5)): RunGraph {
  return {
    teamId: "t",
    runId,
    workflowId: "wf",
    workflowName: "Flow",
    status,
    createdAt: updatedAt,
    updatedAt,
    approvalNodeId: null,
    nodes,
    edges: [],
  };
}

function queue(agentId: string, over: Partial<AgentQueue> = {}): AgentQueue {
  return { teamId: "t", agentId, pending: [], claims: [], ...over };
}

describe("ago", () => {
  it.each([
    [minutesAgo(0.5), "30s ago"],
    [minutesAgo(5), "5m ago"],
    [minutesAgo(90), "2h ago"],
    [minutesAgo(60 * 72), "3d ago"],
    [null, "unknown"],
  ])("formats %s as %s", (iso, expected) => {
    expect(ago(iso, NOW)).toBe(expected);
  });
});

describe("isClaimLive", () => {
  it("is live within its lease, or within an hour when it has none", () => {
    expect(isClaimLive({ taskId: "a", claimedAt: minutesAgo(1), leaseSeconds: 120, task: null }, NOW)).toBe(true);
    expect(isClaimLive({ taskId: "a", claimedAt: minutesAgo(3), leaseSeconds: 120, task: null }, NOW)).toBe(false);
    expect(isClaimLive({ taskId: "a", claimedAt: minutesAgo(59), leaseSeconds: null, task: null }, NOW)).toBe(true);
    expect(isClaimLive({ taskId: "a", claimedAt: minutesAgo(61), leaseSeconds: null, task: null }, NOW)).toBe(false);
    expect(isClaimLive({ taskId: "a", claimedAt: null, leaseSeconds: null, task: null }, NOW)).toBe(false);
  });
});

describe("workingNow", () => {
  it("joins live claims to their run and adds running nodes without duplicating them", () => {
    const runs = [run("r1", "running", [node("draft", "writer", "running", minutesAgo(2)), node("qc", "qa", "running", minutesAgo(1))])];
    const queues = [
      queue("writer", {
        claims: [{ taskId: "k1", claimedAt: minutesAgo(2), leaseSeconds: null, task: { id: "k1", ts: minutesAgo(3), runId: "r1", nodeId: "draft" } }],
      }),
      queue("stale", { claims: [{ taskId: "k2", claimedAt: minutesAgo(120), leaseSeconds: null, task: null }] }),
    ];

    const items = workingNow(queues, runs, NOW);

    expect(items.map((i) => [i.agentId, i.source, i.nodeId, i.workflowName])).toEqual([
      ["qa", "run", "qc", "Flow"],
      ["writer", "claim", "draft", "Flow"],
    ]);
  });

  it("ignores running nodes of runs that are not active", () => {
    expect(workingNow([], [run("r1", "error", [node("a", "x", "running")])], NOW)).toEqual([]);
  });
});

describe("lastSeenByAgent", () => {
  it("keeps each agent's newest finished step", () => {
    const seen = lastSeenByAgent([
      run("r1", "completed", [node("a", "writer", "success", minutesAgo(30)), node("b", "qa", "error", minutesAgo(20))]),
      run("r2", "running", [node("a", "writer", "success", minutesAgo(10)), node("c", "writer", "pending", null)]),
    ]);
    expect(seen.get("writer")).toMatchObject({ runId: "r2", nodeId: "a", status: "success" });
    expect(seen.get("qa")).toMatchObject({ runId: "r1", nodeId: "b", status: "error" });
    expect(seen.size).toBe(2);
  });
});

describe("needsAttention", () => {
  it("is empty when all is well", () => {
    expect(
      needsAttention({ runs: [run("r1", "completed", [])], queues: [queue("a")], manifestGeneratedAt: minutesAgo(1), now: NOW }),
    ).toEqual([]);
  });

  it("reports each problem, failures first", () => {
    const items = needsAttention({
      runs: [
        run("old-approval", "awaiting_approval", [], minutesAgo(60 * 48)),
        run("new-approval", "awaiting_approval", [], minutesAgo(60)),
        run("failed", "error", [], minutesAgo(30)),
        run("old-failure", "error", [], minutesAgo(60 * 30)),
      ],
      queues: [
        queue("stuck", { pending: [{ id: "q1", ts: minutesAgo(90), runId: "r", nodeId: "n" }] }),
        queue("fresh", { pending: [{ id: "q2", ts: minutesAgo(5), runId: "r", nodeId: "n" }] }),
        queue("dead", { claims: [{ taskId: "k", claimedAt: minutesAgo(120), leaseSeconds: null, task: { id: "k", ts: null, runId: "r9", nodeId: "n9" } }] }),
      ],
      manifestGeneratedAt: minutesAgo(180),
      now: NOW,
    });

    expect(items.map((i) => [i.level, i.id])).toEqual([
      ["fail", "failed-runs"],
      ["fail", "queue:t/stuck"],
      ["warn", "approval:t/old-approval"],
      ["warn", "claim:t/dead/k"],
      ["warn", "manifest"],
    ]);
    expect(items[0].title).toBe("1 run failed in the last 24h");
    expect(items[1].title).toBe("1 task queued for stuck, oldest 2h ago");
    expect(items[3].detail).toBe("run r9 · n9");
  });

  it("flags a missing manifest", () => {
    const [item] = needsAttention({ runs: [], queues: [], manifestGeneratedAt: null, now: NOW });
    expect(item).toMatchObject({ id: "manifest", level: "warn", title: "Kitchen manifest is missing" });
  });
});

describe("teamSummaries", () => {
  const manifest = {
    version: 1,
    generatedAt: minutesAgo(1),
    teams: {
      main: { teamId: "main", displayName: null, roles: [], ticketCounts: { backlog: 0, "in-progress": 0, testing: 0, done: 0, total: 0 }, activeRunCount: 0 },
      "hmx-social": { teamId: "hmx-social", displayName: null, roles: ["lead", "writer", "gone"], ticketCounts: { backlog: 3, "in-progress": 1, testing: 0, done: 2, total: 6 }, activeRunCount: 0 },
      "hmx-social-2": { teamId: "hmx-social-2", displayName: "Second", roles: [], ticketCounts: { backlog: 0, "in-progress": 0, testing: 0, done: 0, total: 0 }, activeRunCount: 0 },
    },
    agents: [
      { id: "main", workspace: "/h/.openclaw/workspace" },
      { id: "hmx-social-lead", identityName: "Lead", workspace: "/h/.openclaw/workspace-hmx-social/roles/lead" },
      { id: "hmx-social-writer", workspace: "/h/.openclaw/workspace-hmx-social/roles/writer" },
      { id: "hmx-social-2-lead", workspace: "/h/.openclaw/workspace-hmx-social-2/roles/lead" },
    ],
    recipes: [{ id: "hmx-social", name: "Social Team", kind: "team" }],
  } as unknown as KitchenManifest;

  it("names teams, attaches agents by workspace, and finds the lead and missing roles", () => {
    expect(teamSummaries(manifest)).toEqual([
      {
        id: "hmx-social-2",
        name: "Second",
        agents: [{ id: "hmx-social-2-lead", name: "hmx-social-2-lead" }],
        lead: "hmx-social-2-lead",
        missingRoles: [],
        tickets: { backlog: 0, inProgress: 0, testing: 0, done: 0, total: 0 },
      },
      {
        id: "hmx-social",
        name: "Social Team",
        agents: [
          { id: "hmx-social-lead", name: "Lead" },
          { id: "hmx-social-writer", name: "hmx-social-writer" },
        ],
        lead: "hmx-social-lead",
        missingRoles: ["gone"],
        tickets: { backlog: 3, inProgress: 1, testing: 0, done: 2, total: 6 },
      },
    ]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/dashboard/__tests__/activity.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: implement** — `src/lib/dashboard/activity.ts`:

```ts
import type { KitchenManifest } from "@/lib/manifest";
import type { GraphNodeStatus, RunGraph } from "@/lib/workflows/run-graph";

/**
 * What agents are doing, what each did last, and what needs a person —
 * derived from workflow queues, runs and the manifest. Pure; the file reads
 * live in `overview.ts`.
 */

export type QueueTask = { id: string; ts: string | null; runId: string | null; nodeId: string | null };

export type QueueClaim = {
  taskId: string;
  claimedAt: string | null;
  leaseSeconds: number | null;
  /** The queued task this claim is for, if it is still in the queue file. */
  task: QueueTask | null;
};

export type AgentQueue = {
  teamId: string;
  agentId: string;
  /** Tasks at or past the worker's read cursor. */
  pending: QueueTask[];
  claims: QueueClaim[];
};

export type WorkItem = {
  agentId: string;
  teamId: string;
  source: "claim" | "run";
  runId: string | null;
  workflowId: string | null;
  workflowName: string | null;
  nodeId: string | null;
  since: string | null;
};

export type LastSeen = {
  agentId: string;
  teamId: string;
  runId: string;
  workflowId: string;
  workflowName: string | null;
  nodeId: string;
  status: GraphNodeStatus;
  ts: string;
};

export type Attention = { id: string; level: "fail" | "warn"; title: string; detail: string; href: string | null };

export type TeamSummary = {
  id: string;
  name: string;
  agents: { id: string; name: string }[];
  lead: string | null;
  missingRoles: string[];
  tickets: { backlog: number; inProgress: number; testing: number; done: number; total: number };
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ClawRecipes writes claims without a lease; a worker turn takes minutes, so an hour is stuck. */
export const DEFAULT_CLAIM_LEASE_SECONDS = 3600;

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_workers"]);
const FINISHED_NODE_STATUSES = new Set<GraphNodeStatus>(["success", "error", "waiting"]);

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

/** True when `iso` is more than `span` ago — or unknown, which is no better. */
function olderThan(iso: string | null | undefined, span: number, now: number): boolean {
  const age = now - ms(iso);
  return Number.isNaN(age) || age > span;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function ago(iso: string | null | undefined, now: number): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return "unknown";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function isClaimLive(claim: QueueClaim, now: number): boolean {
  const claimedAt = ms(claim.claimedAt);
  if (!Number.isFinite(claimedAt)) return false;
  const lease = claim.leaseSeconds ?? DEFAULT_CLAIM_LEASE_SECONDS;
  return now - claimedAt <= lease * 1000;
}

function claimedWork(queues: AgentQueue[], runs: RunGraph[], now: number): WorkItem[] {
  const runsById = new Map(runs.map((r) => [`${r.teamId}/${r.runId}`, r]));
  return queues.flatMap((q) =>
    q.claims
      .filter((claim) => isClaimLive(claim, now))
      .map((claim): WorkItem => {
        const runId = claim.task?.runId ?? null;
        const owner = runId ? runsById.get(`${q.teamId}/${runId}`) : undefined;
        return {
          agentId: q.agentId,
          teamId: q.teamId,
          source: "claim",
          runId,
          workflowId: owner?.workflowId ?? null,
          workflowName: owner?.workflowName ?? null,
          nodeId: claim.task?.nodeId ?? null,
          since: claim.claimedAt,
        };
      }),
  );
}

function runningNodes(runs: RunGraph[]): WorkItem[] {
  return runs
    .filter((r) => ACTIVE_RUN_STATUSES.has(r.status))
    .flatMap((r) =>
      r.nodes
        .filter((n) => n.status === "running" && n.agent)
        .map((n): WorkItem => ({
          agentId: n.agent ?? "",
          teamId: r.teamId,
          source: "run",
          runId: r.runId,
          workflowId: r.workflowId,
          workflowName: r.workflowName,
          nodeId: n.id,
          since: n.ts ?? r.updatedAt,
        })),
    );
}

export function workingNow(queues: AgentQueue[], runs: RunGraph[], now: number): WorkItem[] {
  // A claimed step is usually also a running node; list it once, as the claim.
  const seen = new Set<string>();
  const items = [...claimedWork(queues, runs, now), ...runningNodes(runs)].filter((w) => {
    const key = `${w.agentId}|${w.runId}|${w.nodeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return items.sort((a, b) => (ms(b.since) || 0) - (ms(a.since) || 0));
}

export function lastSeenByAgent(runs: RunGraph[]): Map<string, LastSeen> {
  const latest = new Map<string, LastSeen>();
  for (const r of runs) {
    for (const n of r.nodes) {
      if (!n.agent || !n.ts || !FINISHED_NODE_STATUSES.has(n.status)) continue;
      const current = latest.get(n.agent);
      if (current && ms(current.ts) >= ms(n.ts)) continue;
      latest.set(n.agent, {
        agentId: n.agent,
        teamId: r.teamId,
        runId: r.runId,
        workflowId: r.workflowId,
        workflowName: r.workflowName,
        nodeId: n.id,
        status: n.status,
        ts: n.ts,
      });
    }
  }
  return latest;
}

function staleApprovals(runs: RunGraph[], now: number): Attention[] {
  return runs
    .filter((r) => r.status === "awaiting_approval" && olderThan(r.updatedAt ?? r.createdAt, DAY, now))
    .map((r) => ({
      id: `approval:${r.teamId}/${r.runId}`,
      level: "warn" as const,
      title: `Approval waiting since ${ago(r.updatedAt ?? r.createdAt, now)}`,
      detail: `${r.workflowName ?? r.workflowId} · ${r.teamId}`,
      href: "/workflows",
    }));
}

function failedRuns(runs: RunGraph[], now: number): Attention[] {
  const failed = runs.filter((r) => r.status === "error" && now - ms(r.updatedAt ?? r.createdAt) <= DAY);
  if (failed.length === 0) return [];
  const names = Array.from(new Set(failed.map((r) => r.workflowName ?? r.workflowId)));
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");
  return [{ id: "failed-runs", level: "fail", title: `${plural(failed.length, "run")} failed in the last 24h`, detail: shown, href: "/runs" }];
}

function queueProblems(queues: AgentQueue[], now: number): Attention[] {
  const items: Attention[] = [];
  for (const q of queues) {
    const oldest = Math.min(...q.pending.map((t) => ms(t.ts)).filter(Number.isFinite));
    if (q.pending.length && Number.isFinite(oldest) && now - oldest > HOUR) {
      items.push({
        id: `queue:${q.teamId}/${q.agentId}`,
        level: "fail",
        title: `${plural(q.pending.length, "task")} queued for ${q.agentId}, oldest ${ago(new Date(oldest).toISOString(), now)}`,
        detail: "No worker has picked these up — check the agent's workflow-worker cron.",
        href: "/cron-jobs",
      });
    }
    for (const claim of q.claims) {
      if (isClaimLive(claim, now)) continue;
      items.push({
        id: `claim:${q.teamId}/${q.agentId}/${claim.taskId}`,
        level: "warn",
        title: `${q.agentId} has held a task since ${ago(claim.claimedAt, now)}`,
        detail: claim.task?.runId ? `run ${claim.task.runId} · ${claim.task.nodeId}` : `task ${claim.taskId}`,
        href: null,
      });
    }
  }
  return items;
}

function manifestProblem(generatedAt: string | null, now: number): Attention[] {
  if (!generatedAt) {
    return [{ id: "manifest", level: "warn", title: "Kitchen manifest is missing", detail: "Team and agent lists fall back to slower reads.", href: null }];
  }
  if (now - ms(generatedAt) <= HOUR) return [];
  return [{
    id: "manifest",
    level: "warn",
    title: `Kitchen manifest last regenerated ${ago(generatedAt, now)}`,
    detail: "`openclaw recipes kitchen-manifest` may be failing; team and agent lists may be out of date.",
    href: null,
  }];
}

export function needsAttention(input: {
  runs: RunGraph[];
  queues: AgentQueue[];
  manifestGeneratedAt: string | null;
  now: number;
}): Attention[] {
  const { runs, queues, manifestGeneratedAt, now } = input;
  const items = [
    ...failedRuns(runs, now),
    ...staleApprovals(runs, now),
    ...queueProblems(queues, now),
    ...manifestProblem(manifestGeneratedAt, now),
  ];
  // Failures first; Array#sort is stable, so each group keeps its order.
  const rank = (a: Attention) => (a.level === "fail" ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b));
}

export function teamSummaries(manifest: KitchenManifest): TeamSummary[] {
  const recipeNames = new Map(manifest.recipes.filter((r) => r.kind === "team").map((r) => [r.id, r.name]));
  return Object.values(manifest.teams)
    // `main` is the personal workspace, not a team.
    .filter((t) => t.teamId !== "main")
    .map((t) => {
      const agents = manifest.agents
        .filter((a) => (a.workspace ?? "").includes(`/workspace-${t.teamId}/`))
        .map((a) => ({ id: a.id, name: a.identityName ?? a.id }));
      const ids = new Set(agents.map((a) => a.id));
      const counts = t.ticketCounts;
      return {
        id: t.teamId,
        name: t.displayName ?? recipeNames.get(t.teamId) ?? t.teamId,
        agents,
        lead: ids.has(`${t.teamId}-lead`) ? `${t.teamId}-lead` : null,
        missingRoles: (t.roles ?? []).filter((role) => !ids.has(`${t.teamId}-${role}`)),
        tickets: {
          backlog: counts?.backlog ?? 0,
          inProgress: counts?.["in-progress"] ?? 0,
          testing: counts?.testing ?? 0,
          done: counts?.done ?? 0,
          total: counts?.total ?? 0,
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4:** run the test — expect PASS; `npx eslint src/lib/dashboard` — clean.
- [ ] **Step 5:** commit `feat(dashboard): derive working-now, last-seen, attention and team summaries`.

---

### Task 2: `overview.ts` — queue reads + `loadDashboard`

**Files:** Create `src/lib/dashboard/overview.ts`; Test `src/lib/dashboard/__tests__/overview.test.ts`; Modify `src/lib/workflows/overview.ts` (export `readJsonOrNull`).

**Interfaces:**
- Consumes: Task 1 types; `getTeamWorkspaceDir`; `readManifest`, `KitchenManifest`; `discoverKitchenPlugins`; `resolveTeamIds`, `listRunGraphs`, `listInstalledWorkflows`, `InstalledWorkflow`, `readJsonOrNull` (`@/lib/workflows/overview`).
- Produces: `readAgentQueues(teamIds: string[]): Promise<AgentQueue[]>`, `DashboardPlugin = { id; name; tabs: string[]; teamTypes: string[] }`, `DashboardData`, `loadDashboard(): Promise<DashboardData>`.

- [ ] **Step 1: failing test** — `src/lib/dashboard/__tests__/overview.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ root: "" }));

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn(async (teamId: string) => `${ctx.root}/workspace-${teamId}`),
}));

import { readAgentQueues } from "@/lib/dashboard/overview";

const QDIR = "workspace-alpha/shared-context/workflow-queues";

async function write(rel: string, data: string) {
  const p = path.join(ctx.root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data, "utf8");
}

const line = (id: string, nodeId: string) =>
  JSON.stringify({ id, ts: "2026-09-21T10:00:00.000Z", teamId: "alpha", runId: "run-1", nodeId, kind: "execute_node" }) + "\n";

beforeEach(async () => {
  ctx.root = await fs.mkdtemp(path.join(os.tmpdir(), "ck-dashboard-"));
});

afterEach(async () => {
  await fs.rm(ctx.root, { recursive: true, force: true });
});

describe("readAgentQueues", () => {
  it("splits consumed and pending tasks at the byte offset and joins claims to tasks", async () => {
    const consumed = line("t1", "draft");
    await write(`${QDIR}/alpha-writer.jsonl`, consumed + line("t2", "qc") + "not json\n");
    await write(`${QDIR}/alpha-writer.state.json`, JSON.stringify({ offsetBytes: Buffer.byteLength(consumed) }));
    await write(`${QDIR}/claims/alpha-writer.t1.json`, JSON.stringify({ taskId: "t1", agentId: "alpha-writer", claimedAt: "2026-09-21T10:01:00.000Z" }));
    await write(`${QDIR}/claims/alpha-writer-2.t9.json`, JSON.stringify({ taskId: "t9", agentId: "alpha-writer-2" }));
    await write(`${QDIR}/alpha-idle.jsonl`, "");

    const queues = await readAgentQueues(["alpha", "missing"]);
    const writer = queues.find((q) => q.agentId === "alpha-writer");

    expect(queues.map((q) => q.agentId).sort()).toEqual(["alpha-idle", "alpha-writer"]);
    expect(writer?.pending.map((t) => t.id)).toEqual(["t2"]);
    expect(writer?.claims).toEqual([
      {
        taskId: "t1",
        claimedAt: "2026-09-21T10:01:00.000Z",
        leaseSeconds: null,
        task: { id: "t1", ts: "2026-09-21T10:00:00.000Z", runId: "run-1", nodeId: "draft" },
      },
    ]);
  });

  it("treats an offset past the end of the file as a reset, like the worker does", async () => {
    await write(`${QDIR}/alpha-writer.jsonl`, line("t1", "draft"));
    await write(`${QDIR}/alpha-writer.state.json`, JSON.stringify({ offsetBytes: 99999 }));
    const [q] = await readAgentQueues(["alpha"]);
    expect(q.pending.map((t) => t.id)).toEqual(["t1"]);
  });
});
```

- [ ] **Step 2:** run — expect FAIL.
- [ ] **Step 3: implement.** In `src/lib/workflows/overview.ts` change `async function readJsonOrNull` to `export async function readJsonOrNull`. Create `src/lib/dashboard/overview.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentQueue, QueueClaim, QueueTask } from "@/lib/dashboard/activity";
import { discoverKitchenPlugins } from "@/lib/kitchen-plugins";
import { readManifest, type KitchenManifest } from "@/lib/manifest";
import { getTeamWorkspaceDir } from "@/lib/paths";
import {
  listInstalledWorkflows,
  listRunGraphs,
  readJsonOrNull,
  resolveTeamIds,
  type InstalledWorkflow,
} from "@/lib/workflows/overview";
import type { RunGraph } from "@/lib/workflows/run-graph";

/** Everything /dashboard reads, straight from files — no CLI calls. */

const QUEUES_DIR = path.join("shared-context", "workflow-queues");
const NEWLINE = 10;

export type DashboardPlugin = { id: string; name: string; tabs: string[]; teamTypes: string[] };

export type DashboardData = {
  now: number;
  manifest: KitchenManifest | null;
  runs: RunGraph[];
  installed: InstalledWorkflow[];
  queues: AgentQueue[];
  plugins: DashboardPlugin[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function toTask(raw: string): QueueTask | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const id = str(o.id);
    return id ? { id, ts: str(o.ts), runId: str(o.runId), nodeId: str(o.nodeId) } : null;
  } catch {
    return null;
  }
}

/** Queue lines with their byte positions: the worker's cursor is a byte offset. */
function parseQueue(buf: Buffer, offsetBytes: number): { all: QueueTask[]; pending: QueueTask[] } {
  const all: QueueTask[] = [];
  const pending: QueueTask[] = [];
  let start = 0;
  while (start < buf.length) {
    const nl = buf.indexOf(NEWLINE, start);
    const end = nl === -1 ? buf.length : nl;
    const task = toTask(buf.subarray(start, end).toString("utf8").trim());
    if (task) {
      all.push(task);
      if (start >= offsetBytes) pending.push(task);
    }
    start = end + 1;
  }
  return { all, pending };
}

async function readClaims(claimsDir: string, files: string[], agentId: string, tasks: Map<string, QueueTask>): Promise<QueueClaim[]> {
  const prefix = `${agentId}.`;
  const claims = await Promise.all(
    files
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map(async (f): Promise<QueueClaim | null> => {
        const raw = await readJsonOrNull(path.join(claimsDir, f));
        const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
        if (!c || (c.agentId !== undefined && c.agentId !== agentId)) return null;
        const taskId = str(c.taskId) ?? f.slice(prefix.length, -".json".length);
        return {
          taskId,
          claimedAt: str(c.claimedAt),
          leaseSeconds: typeof c.leaseSeconds === "number" ? c.leaseSeconds : null,
          task: tasks.get(taskId) ?? null,
        };
      }),
  );
  return claims.filter((c): c is QueueClaim => c !== null);
}

async function readTeamQueues(teamId: string): Promise<AgentQueue[]> {
  const dir = path.join(await getTeamWorkspaceDir(teamId), QUEUES_DIR);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const claimsDir = path.join(dir, "claims");
  const claimFiles = await fs.readdir(claimsDir).catch(() => [] as string[]);

  const agents = files.filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -".jsonl".length));
  return Promise.all(
    agents.map(async (agentId): Promise<AgentQueue> => {
      const [buf, state] = await Promise.all([
        fs.readFile(path.join(dir, `${agentId}.jsonl`)).catch(() => Buffer.alloc(0)),
        readJsonOrNull(path.join(dir, `${agentId}.state.json`)),
      ]);
      const rawOffset = (state as { offsetBytes?: unknown } | null)?.offsetBytes;
      const offset = typeof rawOffset === "number" && rawOffset <= buf.length ? rawOffset : 0;
      const { all, pending } = parseQueue(buf, offset);
      const claims = await readClaims(claimsDir, claimFiles, agentId, new Map(all.map((t) => [t.id, t])));
      return { teamId, agentId, pending, claims };
    }),
  );
}

export async function readAgentQueues(teamIds: string[]): Promise<AgentQueue[]> {
  return (await Promise.all(teamIds.map(readTeamQueues))).flat();
}

function listPlugins(): DashboardPlugin[] {
  try {
    return Array.from(discoverKitchenPlugins().values())
      .map((p) => ({ id: p.id, name: p.name, tabs: p.tabs.map((t) => t.label), teamTypes: p.teamTypes }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const [manifest, teamIds] = await Promise.all([readManifest(), resolveTeamIds("")]);
  const [{ runs }, installed, queues] = await Promise.all([
    listRunGraphs({ teamIds, limit: Number.MAX_SAFE_INTEGER }),
    listInstalledWorkflows(teamIds),
    readAgentQueues(teamIds),
  ]);
  return { now: Date.now(), manifest, runs, installed, queues, plugins: listPlugins() };
}
```

- [ ] **Step 4:** run tests (dashboard + workflows) — PASS; eslint clean.
- [ ] **Step 5:** commit `feat(dashboard): read agent queues and load dashboard data from files`.

---

### Task 3: Page, panels, nav

**Files:** Create `src/app/dashboard/page.tsx`, `src/app/dashboard/panels.tsx`; Modify `src/components/AppShell.tsx`.

- [ ] **Step 1:** `src/app/dashboard/panels.tsx`:

```tsx
import Link from "next/link";
import { ago, type Attention, type LastSeen, type TeamSummary, type WorkItem } from "@/lib/dashboard/activity";
import type { DashboardPlugin } from "@/lib/dashboard/overview";
import type { InstalledWorkflow } from "@/lib/workflows/overview";
import type { RunGraph } from "@/lib/workflows/run-graph";
import SelectTeamLink from "./select-team-link";

/** Dashboard panels — server components over data read at request time. */

const CARD = "ck-card p-4";
const LABEL = "text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]";
const MUTED = "text-xs text-[color:var(--ck-text-tertiary)]";
const LINK_MUTED = "text-xs text-[color:var(--ck-text-tertiary)] hover:underline";

const RUN_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-300",
  running: "bg-sky-500/20 text-sky-300",
  queued: "bg-sky-500/20 text-sky-300",
  waiting_workers: "bg-sky-500/20 text-sky-300",
  awaiting_approval: "bg-amber-500/20 text-amber-300",
  needs_revision: "bg-amber-500/20 text-amber-300",
  error: "bg-red-500/20 text-red-300",
};

function badge(status: string): string {
  return RUN_BADGE[status] ?? "bg-white/10 text-[color:var(--ck-text-secondary)]";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function human(s: string): string {
  return s.replace(/_/g, " ");
}

function agentHref(id: string): string {
  return `/agents/${encodeURIComponent(id)}`;
}

function runHref(teamId: string, workflowId: string, runId: string): string {
  return `/teams/${encodeURIComponent(teamId)}/runs/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}`;
}

function PanelHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {aside}
    </div>
  );
}

export function StatCard({ label, value, hint, href }: { label: string; value: number; hint: string; href?: string }) {
  const body = (
    <>
      <div className={LABEL}>{label}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-[color:var(--ck-text-secondary)]">{hint}</div>
    </>
  );
  return href ? (
    <Link href={href} className={`${CARD} block transition-colors hover:bg-white/5`}>
      {body}
    </Link>
  ) : (
    <div className={CARD}>{body}</div>
  );
}

function stepLabel(workflow: string | null, nodeId: string | null): string {
  return [workflow, nodeId].filter(Boolean).join(" · ") || "unknown step";
}

export function WorkingNow({
  working,
  lastSeen,
  agents,
  now,
}: {
  working: WorkItem[];
  lastSeen: Map<string, LastSeen>;
  agents: { id: string; name: string }[];
  now: number;
}) {
  const busy = new Set(working.map((w) => w.agentId)).size;
  const recent = agents
    .map((a) => ({ agent: a, last: lastSeen.get(a.id) ?? null }))
    .sort((a, b) => String(b.last?.ts ?? "").localeCompare(String(a.last?.ts ?? "")))
    .slice(0, 8);

  return (
    <section className={CARD}>
      <PanelHeader
        title="Working now"
        aside={<span className={MUTED}>{busy > 0 ? `${busy} of ${agents.length} agents busy` : `${agents.length} agents idle`}</span>}
      />
      {working.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {working.map((w) => (
            <li key={`${w.agentId}|${w.runId}|${w.nodeId}`} className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
              <div className="min-w-0">
                <Link href={agentHref(w.agentId)} className="font-medium hover:underline">
                  {w.agentId}
                </Link>
                <div className="truncate text-sm text-[color:var(--ck-text-secondary)]">
                  {w.runId && w.workflowId ? (
                    <Link href={runHref(w.teamId, w.workflowId, w.runId)} className="hover:underline">
                      {stepLabel(w.workflowName ?? w.workflowId, w.nodeId)}
                    </Link>
                  ) : (
                    stepLabel(w.workflowName, w.nodeId)
                  )}
                </div>
                <div className={MUTED}>
                  since {ago(w.since, now)} · {w.source === "claim" ? "claimed by a worker" : "running in its workflow"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-[color:var(--ck-text-secondary)]">
            Nothing running. Workers pick up queued steps on their cron tick — here is what each agent did last.
          </p>
          <ul className="mt-2 divide-y divide-[color:var(--ck-border-subtle)]">
            {recent.map(({ agent, last }) => (
              <li key={agent.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <Link href={agentHref(agent.id)} className="shrink-0 text-sm hover:underline">
                  {agent.name}
                </Link>
                <span className="truncate text-xs text-[color:var(--ck-text-tertiary)]">
                  {last
                    ? `${human(last.status)} · ${stepLabel(last.workflowName ?? last.workflowId, last.nodeId)} · ${ago(last.ts, now)}`
                    : "no workflow steps yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function WorkflowsPanel({ installed, runs, now }: { installed: InstalledWorkflow[]; runs: RunGraph[]; now: number }) {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const parked = counts.get("awaiting_approval") ?? 0;
  const recent = [...runs].sort((a, b) => b.runId.localeCompare(a.runId)).slice(0, 5);

  return (
    <section className={CARD}>
      <PanelHeader title="Workflows" aside={<Link href="/workflows" className={LINK_MUTED}>all workflows →</Link>} />
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{installed.length} installed</span>
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => (
            <span key={status} className={`rounded-full px-2.5 py-1 text-xs ${badge(status)}`}>
              {count} {human(status)}
            </span>
          ))}
      </div>
      {parked > 0 ? (
        <Link
          href="/workflows"
          className="mt-3 block rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5 text-sm text-amber-100 hover:bg-amber-500/15"
        >
          {plural(parked, "run")} waiting on your approval →
        </Link>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {recent.map((r) => (
          <li key={`${r.teamId}/${r.runId}`} className="flex items-baseline justify-between gap-3 text-sm">
            <Link href={runHref(r.teamId, r.workflowId, r.runId)} className="truncate hover:underline">
              {r.workflowName ?? r.workflowId}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <span className={MUTED}>{ago(r.updatedAt ?? r.createdAt, now)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${badge(r.status)}`}>{human(r.status)}</span>
            </span>
          </li>
        ))}
        {recent.length === 0 ? <li className="text-sm text-[color:var(--ck-text-tertiary)]">No runs yet.</li> : null}
      </ul>
    </section>
  );
}

export function AttentionPanel({ items }: { items: Attention[] }) {
  return (
    <section className={CARD}>
      <PanelHeader title="Needs attention" aside={<span className={MUTED}>{items.length ? `${items.length} to look at` : "all clear"}</span>} />
      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[color:var(--ck-text-secondary)]">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Nothing waiting on you: no stale approvals, failed runs, stuck workers or queue backlogs.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const body = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.level === "fail" ? "bg-red-400" : "bg-amber-400"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-[color:var(--ck-text-tertiary)]">{item.detail}</span>
                </span>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-white/5">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 p-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const LANES: { key: keyof TeamSummary["tickets"]; label: string; lane: string }[] = [
  { key: "backlog", label: "backlog", lane: "backlog" },
  { key: "inProgress", label: "in progress", lane: "in-progress" },
  { key: "testing", label: "testing", lane: "testing" },
  { key: "done", label: "done", lane: "done" },
];

function TeamCard({ team, selected }: { team: TeamSummary; selected: boolean }) {
  return (
    <SelectTeamLink
      teamId={team.id}
      current={selected}
      className={`rounded-xl border p-3 transition-colors ${
        selected ? "border-white/30 bg-white/10" : "border-[color:var(--ck-border-subtle)] bg-white/[0.03] hover:bg-white/[0.07]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-tight">{team.name}</span>
        {selected ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--ck-accent-red)]" /> : null}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">{team.id}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ck-text-secondary)]">
        <span className="tabular-nums">{plural(team.agents.length, "agent")}</span>
        {team.missingRoles.length > 0 ? (
          <span className="text-amber-300" title={`Roles with no agent: ${team.missingRoles.join(", ")}`}>
            {team.missingRoles.length} missing
          </span>
        ) : null}
        {team.lead ? <span className="truncate text-[color:var(--ck-text-tertiary)]">lead: {team.lead}</span> : null}
      </div>
    </SelectTeamLink>
  );
}

export function TeamsPanel({ teams, selectedId }: { teams: TeamSummary[]; selectedId: string }) {
  const team = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!team) {
    return (
      <section className={CARD}>
        <PanelHeader title="Teams" />
        <p className="mt-2 text-sm text-[color:var(--ck-text-tertiary)]">
          No teams yet. <Link href="/recipes" className="hover:underline">Install one from a recipe →</Link>
        </p>
      </section>
    );
  }
  const teamQuery = `team=${encodeURIComponent(team.id)}`;

  return (
    <section className={CARD}>
      <PanelHeader title="Teams" aside={<Link href={`/teams/${encodeURIComponent(team.id)}`} className={LINK_MUTED}>open team →</Link>} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} selected={t.id === team.id} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <dl className="space-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">lead</dt>
            <dd>{team.lead ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">members</dt>
            <dd className="flex flex-wrap gap-1.5">
              {team.agents.length === 0
                ? "—"
                : team.agents.map((a) => (
                    <Link key={a.id} href={agentHref(a.id)} className="rounded bg-white/5 px-1.5 py-0.5 hover:bg-white/10">
                      {a.name}
                    </Link>
                  ))}
            </dd>
          </div>
          {team.missingRoles.length > 0 ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">missing</dt>
              <dd className="text-amber-300">{team.missingRoles.join(", ")}</dd>
            </div>
          ) : null}
        </dl>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={LABEL}>Board</h3>
            <Link href={`/tickets?${teamQuery}`} className={LINK_MUTED}>
              open board →
            </Link>
          </div>
          <ul className="mt-2 space-y-1.5">
            {LANES.map((lane) => (
              <li key={lane.key}>
                <Link
                  href={`/tickets?${teamQuery}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm hover:bg-white/10"
                >
                  <span>{lane.label}</span>
                  <span className="tabular-nums text-[color:var(--ck-text-tertiary)]">{team.tickets[lane.key]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function PluginsPanel({ plugins }: { plugins: DashboardPlugin[] }) {
  return (
    <section className={CARD}>
      <PanelHeader title="Plugins" aside={<span className={MUTED}>{plural(plugins.length, "Kitchen plugin")}</span>} />
      <ul className="mt-3 space-y-2">
        {plugins.map((p) => (
          <li key={p.id} className="rounded-lg bg-white/5 p-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">{p.id}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--ck-text-tertiary)]">
              {p.tabs.length ? `tabs: ${p.tabs.join(", ")}` : "no tabs"}
              {p.teamTypes.length ? ` · for ${p.teamTypes.join(", ")}` : ""}
            </div>
          </li>
        ))}
        {plugins.length === 0 ? <li className="text-sm text-[color:var(--ck-text-tertiary)]">No Kitchen plugins installed.</li> : null}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2:** `src/app/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { lastSeenByAgent, needsAttention, teamSummaries, workingNow } from "@/lib/dashboard/activity";
import { loadDashboard } from "@/lib/dashboard/overview";
import { AttentionPanel, PluginsPanel, StatCard, TeamsPanel, WorkflowsPanel, WorkingNow } from "./panels";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** What this install is, and what it is doing — read from its files on every load. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const sp = await searchParams;
  const selectedTeam = String((Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "").trim();

  const data = await loadDashboard();
  const { now, manifest, runs, installed, queues, plugins } = data;
  const teams = manifest ? teamSummaries(manifest) : [];
  const agents = (manifest?.agents ?? []).map((a) => ({ id: a.id, name: a.identityName ?? a.id }));
  const working = workingNow(queues, runs, now);
  const busy = new Set(working.map((w) => w.agentId)).size;
  const attention = needsAttention({ runs, queues, manifestGeneratedAt: manifest?.generatedAt ?? null, now });
  const queued = queues.reduce((n, q) => n + q.pending.length, 0);
  const parked = runs.filter((r) => r.status === "awaiting_approval").length;
  const tabCount = plugins.reduce((n, p) => n + p.tabs.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-[color:var(--ck-text-tertiary)]">Read from your workspace files at load — nothing here is cached.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Teams"
          value={teams.length}
          href="/"
          hint={teams.length ? teams.slice(0, 2).map((t) => t.name).join(", ") : "none yet"}
        />
        <StatCard label="Agents" value={agents.length} href="/" hint={`${busy} working now`} />
        <StatCard
          label="Workflows"
          value={installed.length}
          href="/workflows"
          hint={parked ? `${parked} awaiting approval` : `${runs.length} runs recorded`}
        />
        <StatCard label="Plugins" value={plugins.length} hint={`${tabCount} tabs`} />
      </div>

      {queued > 0 ? (
        <Link
          href="/cron-jobs"
          className="block rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100 hover:bg-sky-500/15"
        >
          {queued} task{queued === 1 ? "" : "s"} queued for workers →
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkingNow working={working} lastSeen={lastSeenByAgent(runs)} agents={agents} now={now} />
        <WorkflowsPanel installed={installed} runs={runs} now={now} />
      </div>

      <AttentionPanel items={attention} />

      <TeamsPanel teams={teams} selectedId={selectedTeam} />

      <PluginsPanel plugins={plugins} />
    </div>
  );
}
```

- [ ] **Step 3: Nav** — `src/components/AppShell.tsx`: add `"/dashboard"` to `TEAM_SCOPED_ROUTES`; insert first in `globalNav`:

```tsx
    {
      href: navHref(`/dashboard`),
      label: "Dashboard",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        </Icon>
      ),
    },
```

- [ ] **Step 4:** `npx eslint src/app/dashboard src/components/AppShell.tsx src/lib/dashboard` and `npx tsc --noEmit -p . | grep -E "dashboard|AppShell"` — clean.
- [ ] **Step 5:** commit `feat(dashboard): Dashboard page with working-now, workflows, attention, teams and plugins`.

**Added during verification:** team cards and the sidebar switcher disagreed (the sidebar kept a private copy of the selection). `selectTeam()` in `src/lib/selected-team.ts` (+ `src/lib/__tests__/selected-team.test.ts`) writes the store and fires the change event; `AppShell` reads `useSelectedTeamId()`; team cards use `src/app/dashboard/select-team-link.tsx`. AppShell's localStorage effect now only SETS on `/teams/<id>` — clearing on empty wiped the saved team during hydration.

---

### Task 4: Verify and PR

- [ ] `npm run lint && npm run test:run && npm run build` in the worktree.
- [ ] Serve `.next/standalone/server.js` on 127.0.0.1:4199; time `curl /dashboard`; Playwright at 1440 + 1200: screenshot, no horizontal page overflow, `?team=` switches the selected team, cross-check numbers (teams 3, agents 34, workflows 31, approvals 2, runs 258) against files.
- [ ] Push `feat/dashboard-page`; `gh pr create --base main` noting it builds on #419 (merge that first) and that `docs/superpowers/` must be removed before merge. Hand RJ the `!` deploy commands.
