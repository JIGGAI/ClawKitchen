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
