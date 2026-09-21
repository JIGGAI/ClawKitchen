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
