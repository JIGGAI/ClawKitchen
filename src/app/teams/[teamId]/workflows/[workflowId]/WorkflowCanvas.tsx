"use client";

import { useRef, useState } from "react";
import type { WorkflowFileV1 } from "@/lib/workflows/types";

export function WorkflowCanvas({
  wf,
  selectedNodeId,
  onSelectNode,
  onWorkflowChange,
}: {
  wf: WorkflowFileV1 | null;
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  onWorkflowChange: (next: WorkflowFileV1) => void;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<null | {
    nodeId: string;
    dx: number;
    dy: number;
    left: number;
    top: number;
  }>(null);

  const nodes = wf?.nodes ?? [];
  const edges = wf?.edges ?? [];

  return (
    <div
      ref={canvasRef}
      className="relative h-full min-h-0 w-full flex-1 overflow-auto rounded-lg border border-white/10 bg-white/5"
    >
      <div className="relative h-[1200px] w-[2200px]">
        <svg className="absolute inset-0" width={2200} height={1200}>
          {edges.map((e) => {
            const a = nodes.find((n) => n.id === e.from);
            const b = nodes.find((n) => n.id === e.to);
            if (!a || !b || !wf) return null;
            const ax = (typeof a.x === "number" ? a.x : 80) + 90;
            const ay = (typeof a.y === "number" ? a.y : 80) + 24;
            const bx = (typeof b.x === "number" ? b.x : 80) + 90;
            const by = (typeof b.y === "number" ? b.y : 80) + 24;
            return (
              <line
                key={e.id}
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {nodes.map((n, idx) => {
          const x = typeof n.x === "number" ? n.x : 80 + idx * 220;
          const y = typeof n.y === "number" ? n.y : 80;
          const selected = selectedNodeId === n.id;
          return (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectNode(n.id)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const el = canvasRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                onSelectNode(n.id);
                setDragging({
                  nodeId: n.id,
                  dx: e.clientX - rect.left - x,
                  dy: e.clientY - rect.top - y,
                  left: rect.left,
                  top: rect.top,
                });
              }}
              onPointerUp={() => setDragging(null)}
              onPointerMove={(e) => {
                if (!dragging || dragging.nodeId !== n.id || !wf) return;
                const el = canvasRef.current;
                if (!el) return;
                const nextX = e.clientX - dragging.left - dragging.dx;
                const nextY = e.clientY - dragging.top - dragging.dy;
                const nextNodes = wf.nodes.map((node) =>
                  node.id === n.id ? { ...node, x: nextX, y: nextY } : node
                );
                onWorkflowChange({ ...wf, nodes: nextNodes });
              }}
              className={
                selected
                  ? "absolute cursor-grab rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)]"
                  : "absolute cursor-grab rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
              }
              style={{ left: x, top: y, width: 180 }}
            >
              <div className="font-medium text-[color:var(--ck-text-primary)]">{n.name || n.id}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                {n.type}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
