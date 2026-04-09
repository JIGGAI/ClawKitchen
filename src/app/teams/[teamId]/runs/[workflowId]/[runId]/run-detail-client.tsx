"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import RunDeliverables from "@/components/RunDeliverables";
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
  if (status === "canceled") return "border-gray-400/30 bg-gray-500/10 text-gray-50";
  return "border-white/10 bg-white/5 text-[color:var(--ck-text-secondary)]";
}

export default function RunDetailClient({ 
  run, 
  teamId, 
  workflowId 
}: { 
  run: WorkflowRunFileV1; 
  teamId: string; 
  workflowId: string; 
}) {
  const router = useRouter();
  const nodes = Array.isArray(run.nodes) ? run.nodes : [];

  // nodeId is not unique (a workflow can execute the same node multiple times).
  // Use timeline index for stable selection.
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string>("");

  const selectedNode: WorkflowRunNodeResultV1 | undefined = useMemo(
    () => (nodes.length ? nodes[Math.min(Math.max(0, selectedIdx), nodes.length - 1)] : undefined),
    [nodes, selectedIdx]
  );

  // Determine if actions are available
  const canStop = ["running", "waiting_for_approval"].includes(run.status);
  const canDelete = true; // Always allow delete

  const handleStop = async () => {
    try {
      setActionBusy(true);
      setActionError("");

      const response = await fetchJson<{ ok: boolean; error?: string }>(`/api/teams/workflow-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          workflowId,
          runId: run.id,
          action: "stop",
        }),
      });

      if (!response.ok) {
        throw new Error(response.error || "Failed to stop run");
      }

      // Refresh the page to show updated state
      router.refresh();
    } catch (err) {
      setActionError(String(err));
    } finally {
      setActionBusy(false);
      setShowStopModal(false);
    }
  };

  const handleDelete = async () => {
    try {
      setActionBusy(true);
      setActionError("");

      const response = await fetchJson<{ ok: boolean; error?: string }>(`/api/teams/workflow-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          workflowId,
          runId: run.id,
          action: "delete",
        }),
      });

      if (!response.ok) {
        throw new Error(response.error || "Failed to delete run");
      }

      // Navigate back to runs list
      router.push(`/teams/${encodeURIComponent(teamId)}/runs`);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setActionBusy(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1 rounded-3xl border border-white/10 bg-black/10 p-4">
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
          <div className="flex flex-col gap-2">
            {canStop && (
              <button
                type="button"
                onClick={() => setShowStopModal(true)}
                disabled={actionBusy}
                className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Stop Run
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={actionBusy}
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-50"
              >
                Delete Run
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">timeline</div>
          <div className="mt-2 space-y-1">
            {nodes.length ? (
              nodes.map((n, idx) => {
                const active = idx === selectedIdx;
                return (
                  <button
                    key={`${idx}:${n.nodeId}`}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={
                      active
                        ? "w-full rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-left"
                        : "w-full rounded-lg px-2 py-2 text-left hover:bg-white/5"
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
          <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
            <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">approval</div>
            <div className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">
              <div>
                <span className="font-medium">node:</span> <span className="font-mono">{run.approval.nodeId}</span>
              </div>
              <div>
                <span className="font-medium">state:</span> {run.approval.state}
              </div>
              {run.approval.note ? (
                <div className="mt-2 rounded border border-white/10 bg-white/5 p-2 text-[11px]">{run.approval.note}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-black/10 p-4">
        <div className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">node output / error</div>

        {selectedNode ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-sm text-[color:var(--ck-text-primary)]">{selectedNode.nodeId}</div>
              <div className={`rounded-full border px-2 py-1 text-xs ${statusColor(selectedNode.status)}`}>{selectedNode.status}</div>
            </div>

            {selectedNode.error ? (
              <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
                <div className="text-xs font-semibold text-red-50">Error</div>
                <pre className="mt-2 overflow-auto text-xs text-red-50">{asPrettyJson(selectedNode.error)}</pre>
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
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

        <details className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-secondary)]">Raw run file</summary>
          <pre className="mt-3 overflow-auto text-xs text-[color:var(--ck-text-primary)]">{asPrettyJson(run)}</pre>
        </details>
      </div>

      {/* Stop Run Confirmation Modal */}
      <ConfirmationModal
        open={showStopModal}
        onClose={() => {
          setShowStopModal(false);
          setActionError("");
        }}
        title="Stop Workflow Run"
        confirmLabel="Stop Run"
        confirmBusyLabel="Stopping..."
        onConfirm={handleStop}
        busy={actionBusy}
        error={actionError}
        confirmButtonClassName="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          <p>This will cancel the workflow run and set its status to <code className="bg-white/10 px-1 rounded">canceled</code>.</p>
          <p className="mt-2">The run data will be preserved but execution will stop.</p>
        </div>
      </ConfirmationModal>

      {/* Delete Run Confirmation Modal */}
      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setActionError("");
        }}
        title="Delete Workflow Run"
        confirmLabel="Delete Run"
        confirmBusyLabel="Deleting..."
        onConfirm={handleDelete}
        busy={actionBusy}
        error={actionError}
      >
        <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          <p>This will permanently delete the workflow run and all its data.</p>
          <p className="mt-2 font-medium text-[color:var(--ck-text-primary)]">This action cannot be undone.</p>
          <div className="mt-3 rounded border border-white/10 bg-white/5 p-2 text-xs">
            <span className="font-mono">{run.id}</span>
          </div>
        </div>
      </ConfirmationModal>
      </div>

      {/* Run Deliverables Section */}
      <div className="mt-8">
        <RunDeliverables teamId={teamId} workflowId={workflowId} runId={run.id} />
      </div>
    </>
  );
}
