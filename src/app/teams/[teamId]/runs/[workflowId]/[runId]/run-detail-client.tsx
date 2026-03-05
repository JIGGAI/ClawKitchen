"use client";

import { useMemo, useState } from "react";
import type { WorkflowRunFileV1, WorkflowRunNodeResultV1 } from "@/lib/workflows/runs-types";

function asPrettyJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function statusColor(status?: string) {
  if (status === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-50";
  if (status === "error") return "border-red-400/30 bg-red-500/10 text-red-50";
  if (status === "running") return "border-sky-400/30 bg-sky-500/10 text-sky-50";
  if (status === "waiting_for_approval") return "border-amber-400/30 bg-amber-500/10 text-amber-50";
  return "border-white/10 bg-white/5 text-[color:var(--ck-text-secondary)]";
}

export default function RunDetailClient({ run }: { run: WorkflowRunFileV1 }) {
  const nodes = Array.isArray(run.nodes) ? run.nodes : [];
  const [selected, setSelected] = useState<string>(nodes[0]?.nodeId || "");

  const selectedNode: WorkflowRunNodeResultV1 | undefined = useMemo(
    () => nodes.find((n) => n.nodeId === selected) || nodes[0],
    [nodes, selected]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1 rounded-[var(--ck-radius-lg)] border border-white/10 bg-black/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">run status</div>
            <div className={`mt-2 inline-flex items-center rounded-full border px-2 py-1 text-xs ${statusColor(run.status)}`}>
              {run.status}
            </div>
            <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              <div>
                <span className="font-medium">started:</span> {run.startedAt}
              </div>
              {run.endedAt ? (
                <div>
                  <span className="font-medium">ended:</span> {run.endedAt}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">timeline</div>
          <div className="mt-2 space-y-1">
            {nodes.length ? (
              nodes.map((n) => {
                const active = n.nodeId === selected;
                return (
                  <button
                    key={n.nodeId}
                    type="button"
                    onClick={() => setSelected(n.nodeId)}
                    className={
                      active
                        ? "w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/10 px-2 py-2 text-left"
                        : "w-full rounded-[var(--ck-radius-sm)] px-2 py-2 text-left hover:bg-white/5"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-[color:var(--ck-text-primary)]">{n.nodeId}</div>
                      <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">{n.status}</div>
                    </div>
                    {(n.startedAt || n.endedAt) ? (
                      <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
                        {n.startedAt ? `start: ${n.startedAt}` : ""}
                        {n.startedAt && n.endedAt ? " · " : ""}
                        {n.endedAt ? `end: ${n.endedAt}` : ""}
                      </div>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-[color:var(--ck-text-secondary)]">No node results recorded yet.</div>
            )}
          </div>
        </div>

        {run.approval ? (
          <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10 p-3">
            <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">approval</div>
            <div className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">
              <div>
                <span className="font-medium">node:</span> <span className="font-mono">{run.approval.nodeId}</span>
              </div>
              <div>
                <span className="font-medium">state:</span> {run.approval.state}
              </div>
              {run.approval.note ? (
                <div className="mt-2 rounded border border-white/10 bg-black/20 p-2 text-[11px]">{run.approval.note}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 rounded-[var(--ck-radius-lg)] border border-white/10 bg-black/10 p-4">
        <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">node output / error</div>

        {selectedNode ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-sm text-[color:var(--ck-text-primary)]">{selectedNode.nodeId}</div>
              <div className={`rounded-full border px-2 py-1 text-xs ${statusColor(selectedNode.status)}`}>{selectedNode.status}</div>
            </div>

            {selectedNode.error ? (
              <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3">
                <div className="text-xs font-semibold text-red-50">Error</div>
                <pre className="mt-2 overflow-auto text-xs text-red-50">{asPrettyJson(selectedNode.error)}</pre>
              </div>
            ) : null}

            <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold text-[color:var(--ck-text-secondary)]">Output</div>
              {typeof selectedNode.output === "undefined" || selectedNode.output === null ? (
                <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">(no output)</div>
              ) : (
                <pre className="mt-2 max-h-[60vh] overflow-auto text-xs text-[color:var(--ck-text-primary)]">{asPrettyJson(selectedNode.output)}</pre>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Select a node to view its output.</div>
        )}

        <details className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-secondary)]">Raw run file</summary>
          <pre className="mt-3 overflow-auto text-xs text-[color:var(--ck-text-primary)]">{asPrettyJson(run)}</pre>
        </details>
      </div>
    </div>
  );
}
