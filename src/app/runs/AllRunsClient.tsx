"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRunSelection } from "@/hooks/useRunSelection";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { fetchJson } from "@/lib/fetch-json";

export type AllRunsRow = {
  teamId: string;
  teamName?: string | null;
  workflowId: string;
  workflowName?: string;
  runId: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  updatedAt?: string;
};

function fmt(ts?: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function AllRunsClient({ rows }: { rows: AllRunsRow[] }) {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>("");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const teamOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.teamId))).sort();
  }, [rows]);

  const workflowOptions = useMemo(() => {
    const filteredByTeam = teamId ? rows.filter((r) => r.teamId === teamId) : rows;
    return Array.from(new Set(filteredByTeam.map((r) => r.workflowId))).sort();
  }, [rows, teamId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamId && r.teamId !== teamId) return false;
      if (workflowId && r.workflowId !== workflowId) return false;
      if (status && String(r.status ?? "") !== status) return false;
      if (!needle) return true;
      const parts = [r.teamId, r.teamName ?? "", r.workflowId, r.workflowName ?? "", r.runId];
      return parts.some((p) => p.toLowerCase().includes(needle));
    });
  }, [q, rows, status, teamId, workflowId]);

  const visibleIds = useMemo(() => filtered.map((r) => `${r.teamId}:${r.workflowId}:${r.runId}`), [filtered]);
  const { selected, toggle, allSelected, toggleAll, clear, count } = useRunSelection(visibleIds);

  const runsByKey = useMemo(() => {
    const map = new Map<string, AllRunsRow>();
    for (const r of filtered) map.set(`${r.teamId}:${r.workflowId}:${r.runId}`, r);
    return map;
  }, [filtered]);

  const handleBulkDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);

    // Group selected runs by team+workflow for batching
    const groups = new Map<string, { teamId: string; workflowId: string; runIds: string[] }>();
    for (const key of selected) {
      const row = runsByKey.get(key);
      if (!row) continue;
      const gk = `${row.teamId}:${row.workflowId}`;
      if (!groups.has(gk)) groups.set(gk, { teamId: row.teamId, workflowId: row.workflowId, runIds: [] });
      groups.get(gk)!.runIds.push(row.runId);
    }

    try {
      const results = await Promise.all(
        Array.from(groups.values()).map((g) =>
          fetchJson<{ ok: boolean; error?: string }>("/api/teams/workflow-runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId: g.teamId, workflowId: g.workflowId, action: "bulk-delete", runIds: g.runIds }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) throw new Error(failed.map((r) => r.error).join("; "));
      clear();
      setShowDeleteModal(false);
      router.refresh();
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">team</div>
            <select
              value={teamId}
              onChange={(e) => {
                const next = (e.target.value || "").trim();
                setTeamId(next);
                setWorkflowId("");
              }}
              className="mt-1 w-64 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              <option value="">All teams</option>
              {teamOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">workflow</div>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId((e.target.value || "").trim())}
              className="mt-1 w-64 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              <option value="">All workflows</option>
              {workflowOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">status</div>
            <select
              value={status}
              onChange={(e) => setStatus((e.target.value || "").trim())}
              className="mt-1 w-56 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              <option value="">All</option>
              <option value="running">running</option>
              <option value="waiting_for_approval">waiting_for_approval</option>
              <option value="success">success</option>
              <option value="error">error</option>
              <option value="canceled">canceled</option>
              <option value="completed">completed</option>
              <option value="queued">queued</option>
              <option value="waiting_workers">waiting_workers</option>
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="team / workflow / run id"
              className="mt-1 w-72 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
              <th className="border-b border-white/10 px-2 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected && filtered.length > 0}
                  onChange={toggleAll}
                  className="accent-[var(--ck-accent-red)]"
                  aria-label="Select all runs"
                />
              </th>
              <th className="border-b border-white/10 px-2 py-2">team</th>
              <th className="border-b border-white/10 px-2 py-2">workflow</th>
              <th className="border-b border-white/10 px-2 py-2">status</th>
              <th className="border-b border-white/10 px-2 py-2">updated</th>
              <th className="border-b border-white/10 px-2 py-2">run</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((r) => {
                const key = `${r.teamId}:${r.workflowId}:${r.runId}`;
                return (
                <tr key={key} className="text-sm">
                  <td className="border-b border-white/5 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                      className="accent-[var(--ck-accent-red)]"
                      aria-label={`Select run ${r.runId}`}
                    />
                  </td>
                  <td className="border-b border-white/5 px-2 py-2">
                    <div className="text-[color:var(--ck-text-primary)]">{r.teamName || r.teamId}</div>
                    <div className="text-xs text-[color:var(--ck-text-tertiary)] font-mono">{r.teamId}</div>
                  </td>
                  <td className="border-b border-white/5 px-2 py-2">
                    <div className="text-[color:var(--ck-text-primary)]">{r.workflowName || r.workflowId}</div>
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
                      href={`/teams/${encodeURIComponent(r.teamId)}/runs/${encodeURIComponent(r.workflowId)}/${encodeURIComponent(r.runId)}`}
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
                <td colSpan={6} className="px-2 py-6 text-sm text-[color:var(--ck-text-secondary)]">
                  No runs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Showing {filtered.length} of {rows.length}.</div>

      {count > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/80 backdrop-blur-md px-4 py-3 shadow-lg">
          <span className="text-sm text-[color:var(--ck-text-secondary)]">
            {count} run{count !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ck-accent-red-hover)]"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteError(null); }}
        title="Delete Workflow Runs"
        confirmLabel="Delete Runs"
        confirmBusyLabel="Deleting..."
        onConfirm={handleBulkDelete}
        busy={deleteBusy}
        error={deleteError}
      >
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Are you sure you want to permanently delete{" "}
          <strong className="text-[color:var(--ck-text-primary)]">{count} run{count !== 1 ? "s" : ""}</strong>?
          This action cannot be undone.
        </p>
      </ConfirmationModal>
    </div>
  );
}
