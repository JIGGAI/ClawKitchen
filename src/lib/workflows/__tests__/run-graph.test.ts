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
