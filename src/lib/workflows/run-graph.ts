import { approvalNeedsDecision } from "@/lib/workflows/approval-state";

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
  /** Defaults to Date.now(); passed in tests. */
  now?: number;
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

function findApprovalNode(runStatus: string, approval: unknown, nodes: GraphNode[], now: number): string | null {
  if (runStatus !== "awaiting_approval") return null;
  const a = obj(approval);
  const fileNodeId = str(a?.nodeId);
  if (fileNodeId) {
    // Decided and the resume is still expected: offering the buttons again would
    // double-decide. Decided but it never took effect: offer them again.
    const open = approvalNeedsDecision({
      runAwaiting: true,
      decision: str(a?.status) ?? str(a?.state),
      decidedAt: str(a?.decidedAt),
      resumeError: str(a?.resumeError),
      now,
    });
    if (!open) return null;
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
    // The file was edited after this run. nodeStates is in execution order, so
    // hang each vanished node off whatever ran just before it.
    const known = new Set(shape.nodes.map((n) => n.id));
    stateIds.forEach((id, i) => {
      if (known.has(id)) return;
      shape.nodes.push({ ...bareNode(id), type: "removed" });
      if (i > 0) shape.edges.push({ from: stateIds[i - 1], to: id, on: "inferred" });
    });
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

  const approvalNodeId = findApprovalNode(status, input.approval, nodes, input.now ?? Date.now());
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
