"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

  return (
    <div className="rounded-[var(--ck-radius-lg)] border border-white/10 bg-black/10 p-4">
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
              className="mt-1 w-64 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
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
              className="mt-1 w-64 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
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
              className="mt-1 w-56 max-w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
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
              <th className="border-b border-white/10 px-2 py-2">team</th>
              <th className="border-b border-white/10 px-2 py-2">workflow</th>
              <th className="border-b border-white/10 px-2 py-2">status</th>
              <th className="border-b border-white/10 px-2 py-2">updated</th>
              <th className="border-b border-white/10 px-2 py-2">run</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((r) => (
                <tr key={`${r.teamId}:${r.workflowId}:${r.runId}`} className="text-sm">
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
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-sm text-[color:var(--ck-text-secondary)]">
                  No runs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Showing {filtered.length} of {rows.length}.</div>
    </div>
  );
}
