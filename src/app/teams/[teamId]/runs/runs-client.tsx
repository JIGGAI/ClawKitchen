"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { WorkflowRunSummary } from "@/lib/workflows/runs-storage";

function fmt(ts?: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function RunsClient({
  teamId,
  initialRuns,
  workflows,
}: {
  teamId: string;
  initialRuns: WorkflowRunSummary[];
  workflows: Record<string, { id: string; name?: string }>;
}) {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initialRuns.filter((r) => {
      if (workflowId && r.workflowId !== workflowId) return false;
      if (status && String(r.status ?? "") !== status) return false;
      if (!needle) return true;
      const wfName = workflows[r.workflowId]?.name ?? "";
      return (
        r.runId.toLowerCase().includes(needle) ||
        r.workflowId.toLowerCase().includes(needle) ||
        wfName.toLowerCase().includes(needle)
      );
    });
  }, [initialRuns, q, status, workflowId, workflows]);

  const workflowOptions = useMemo(() => {
    const ids = Array.from(new Set(initialRuns.map((r) => r.workflowId).filter(Boolean))).sort();
    return ids;
  }, [initialRuns]);

  return (
    <div className="rounded-[var(--ck-radius-lg)] border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">workflow</div>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId((e.target.value || "").trim())}
              className="mt-1 w-64 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              <option value="">All workflows</option>
              {workflowOptions.map((id) => (
                <option key={id} value={id}>
                  {workflows[id]?.name ? `${workflows[id]?.name} (${id})` : id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">status</div>
            <select
              value={status}
              onChange={(e) => setStatus((e.target.value || "").trim())}
              className="mt-1 w-56 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              <option value="">All</option>
              <option value="running">running</option>
              <option value="waiting_for_approval">waiting_for_approval</option>
              <option value="success">success</option>
              <option value="error">error</option>
              <option value="canceled">canceled</option>
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="run id / workflow / name"
              className="mt-1 w-72 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
              <th className="border-b border-white/10 px-2 py-2">workflow</th>
              <th className="border-b border-white/10 px-2 py-2">status</th>
              <th className="border-b border-white/10 px-2 py-2">updated</th>
              <th className="border-b border-white/10 px-2 py-2">run</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((r) => {
                const wf = workflows[r.workflowId];
                const wfLabel = wf?.name ? wf.name : r.workflowId;
                return (
                  <tr key={`${r.workflowId}:${r.runId}`} className="text-sm">
                    <td className="border-b border-white/5 px-2 py-2">
                      <div className="text-[color:var(--ck-text-primary)]">{wfLabel}</div>
                      <div className="text-xs text-[color:var(--ck-text-tertiary)] font-mono">{r.workflowId}</div>
                    </td>
                    <td className="border-b border-white/5 px-2 py-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-secondary)]">
                        {r.status ?? "(unknown)"}
                      </span>
                    </td>
                    <td className="border-b border-white/5 px-2 py-2 text-xs text-[color:var(--ck-text-secondary)]">
                      {fmt(r.updatedAt || r.endedAt || r.startedAt)}
                    </td>
                    <td className="border-b border-white/5 px-2 py-2">
                      <Link
                        href={`/teams/${encodeURIComponent(teamId)}/runs/${encodeURIComponent(r.workflowId)}/${encodeURIComponent(r.runId)}`}
                        className="font-mono text-sm text-[color:var(--ck-text-primary)] hover:underline"
                      >
                        {r.runId}
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-sm text-[color:var(--ck-text-secondary)]">
                  No runs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
        Showing {filtered.length} of {initialRuns.length}.
      </div>
    </div>
  );
}
