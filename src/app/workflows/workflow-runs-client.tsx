"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import RunGraphSvg from "@/components/workflows/RunGraphSvg";
import { useRunSelection } from "@/hooks/useRunSelection";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { selectTeam } from "@/lib/selected-team";
import type { RunFacets } from "@/lib/workflows/overview";
import type { GraphNode, RunGraph } from "@/lib/workflows/run-graph";
import { RunFilters, type RunFilterState } from "./run-filters";

/**
 * Every run, drawn as its graph. A run waiting on a person is the case this
 * exists for, so the approval is answerable here.
 */

const POLL_MS = 5000;
const PAGE_SIZE = 20;
const MAX_LIMIT = 200;
const SEARCH_DEBOUNCE_MS = 300;

type RunsResponse = { ok: true; runs: RunGraph[]; total: number; facets: RunFacets };
type DecideResponse = { ok: true; resumeError?: string };
// Named like the Telegram replies (`approve <code>` / `decline <code> <what to change>`);
// the API's action for a decline is request_changes — the same call Telegram makes.
type Decision = "approve" | "decline";

const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

const ACTIVE = new Set(["running", "queued", "waiting_workers"]);
const WAITING = new Set(["awaiting_approval", "waiting", "needs_revision", "waiting_handoff"]);
const FAILED = new Set(["error", "rejected"]);
const DONE = new Set(["completed", "success"]);

function statusPill(status: string): string {
  if (ACTIVE.has(status)) return "bg-sky-500/20 text-sky-200";
  if (WAITING.has(status)) return "bg-amber-500/20 text-amber-200";
  if (FAILED.has(status)) return "bg-red-500/20 text-red-200";
  if (DONE.has(status)) return "bg-emerald-500/20 text-emerald-300";
  return "bg-white/10 text-[color:var(--ck-text-secondary)]";
}

function human(status: string): string {
  return status.replace(/_/g, " ");
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function runKey(run: RunGraph): string {
  return `${run.teamId}/${run.runId}`;
}

function decisionNotice(run: RunGraph, node: GraphNode, action: Decision, note: string | undefined, out: DecideResponse): string {
  if (out.resumeError) return `Recorded, but the run did not resume: ${out.resumeError}`;
  const label = node.name ?? node.id;
  if (action === "approve") return `Approved ${label} — resuming ${run.workflowName ?? run.workflowId}.`;
  return note ? `Declined ${label} — sent back for changes.` : `Declined ${label} — run canceled.`;
}

/** Decline with a change request revises (like the Telegram reply); without one it ends the run. */
function apiAction(action: Decision, note: string | undefined): "approve" | "request_changes" | "cancel" {
  if (action === "approve") return "approve";
  return note ? "request_changes" : "cancel";
}

function NodeDetail({
  run,
  node,
  busy,
  onDecide,
}: {
  run: RunGraph;
  node: GraphNode;
  busy: boolean;
  onDecide: (action: Decision, note?: string) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const canDecide = run.status === "awaiting_approval" && run.approvalNodeId === node.id;
  const meta = [node.name ? node.id : null, node.type, node.agent].filter(Boolean).join(" · ");
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{node.name ?? node.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(node.status)}`}>{human(node.status)}</span>
        <span className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">{meta}</span>
        {node.ts ? <span className="text-xs text-[color:var(--ck-text-tertiary)]">{when(node.ts)}</span> : null}
      </div>
      {node.message ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[color:var(--ck-text-secondary)]">{node.message}</p>
      ) : null}
      {canDecide && !declining ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => onDecide("approve")}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </button>
          <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">The run resumes once the decision is recorded.</span>
        </div>
      ) : null}
      {canDecide && declining ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="What should change? Leave empty to cancel the run."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-[color:var(--ck-text-primary)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={busy}
              onClick={() => onDecide("decline", note.trim() || undefined)}
            >
              {busy ? "Working…" : "Decline"}
            </button>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setDeclining(false)}>
              Cancel
            </button>
            <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">
              {note.trim() ? "Sends the run back to its revise step with your note." : "No note: the run is canceled."}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RunCard({
  run,
  teamName,
  selectedId,
  busy,
  checked,
  onCheck,
  onSelect,
  onDecide,
}: {
  run: RunGraph;
  teamName: string;
  selectedId: string | null;
  busy: boolean;
  checked: boolean;
  onCheck: () => void;
  onSelect: (nodeId: string) => void;
  onDecide: (node: GraphNode, action: Decision, note?: string) => void;
}) {
  // Follow the interesting node unless someone picked one.
  const auto = run.nodes.find((n) => n.status === "running") ?? run.nodes.find((n) => n.id === run.approvalNodeId);
  const currentId = selectedId ?? auto?.id ?? null;
  const node = run.nodes.find((n) => n.id === currentId) ?? null;
  const runHref = `/teams/${encodeURIComponent(run.teamId)}/runs/${encodeURIComponent(run.workflowId)}/${encodeURIComponent(run.runId)}`;
  const updated = run.updatedAt && run.updatedAt !== run.createdAt ? ` → ${when(run.updatedAt)}` : "";

  return (
    <div className="ck-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            className="mt-1 accent-[var(--ck-accent-red)]"
            aria-label={`Select run ${run.runId}`}
          />
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{run.workflowName ?? run.workflowId}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(run.status)}`}>{human(run.status)}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">{teamName}</span>
          </div>
          <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
            {when(run.createdAt)}
            {updated}
          </div>
          </div>
        </div>
        <Link href={runHref} className="shrink-0 text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          open run →
        </Link>
      </div>

      <div className="mt-3">
        <RunGraphSvg run={run} selected={currentId} onSelect={onSelect} />
      </div>

      {node ? <NodeDetail run={run} node={node} busy={busy} onDecide={(action, note) => onDecide(node, action, note)} /> : null}
    </div>
  );
}

const NO_FACETS: RunFacets = { workflows: [], statuses: [] };

function runsQuery(team: string, limit: number, filters: RunFilterState, q: string): string {
  const qs = new URLSearchParams({ limit: String(limit), sort: filters.sort });
  if (team) qs.set("team", team);
  if (filters.workflow) qs.set("workflow", filters.workflow);
  if (filters.status) qs.set("status", filters.status);
  if (q.trim()) qs.set("q", q.trim());
  return qs.toString();
}

/** The delete API works per team + workflow, so batch a selection that way. */
function deleteGroups(runs: RunGraph[], selected: Set<string>) {
  const groups = new Map<string, { teamId: string; workflowId: string; runIds: string[] }>();
  for (const run of runs) {
    if (!selected.has(runKey(run))) continue;
    const k = `${run.teamId}\u0000${run.workflowId}`;
    const g = groups.get(k) ?? { teamId: run.teamId, workflowId: run.workflowId, runIds: [] };
    g.runIds.push(run.runId);
    groups.set(k, g);
  }
  return [...groups.values()];
}

function ListHeader({
  shown,
  total,
  filtered,
  allSelected,
  onToggleAll,
}: {
  shown: number;
  total: number;
  filtered: boolean;
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--ck-text-tertiary)]">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="accent-[var(--ck-accent-red)]"
          aria-label="Select all shown runs"
        />
        Select all shown
      </label>
      <span>
        Showing {shown} of {total}
        {filtered ? " matching" : ""} run{total === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function ListFooter({ shown, total, limit, onMore }: { shown: number; total: number; limit: number; onMore: () => void }) {
  if (shown >= total) return null;
  if (limit >= MAX_LIMIT) {
    return (
      <p className="text-xs text-[color:var(--ck-text-tertiary)]">
        Showing the first {shown} of {total}. Narrow the filters to see the rest.
      </p>
    );
  }
  return (
    <button type="button" className={secondaryBtn} onClick={onMore}>
      Load more ({shown} of {total})
    </button>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
      {filtered
        ? "No runs match these filters."
        : "No runs yet. Start one from a team's Workflows tab, or let a cron trigger fire it."}
    </div>
  );
}

function BulkBar({ count, onClear, onDelete }: { count: number; onClear: () => void; onDelete: () => void }) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/80 px-4 py-3 shadow-lg backdrop-blur-md">
      <span className="text-sm text-[color:var(--ck-text-secondary)]">
        {count} run{count === 1 ? "" : "s"} selected
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClear} className={secondaryBtn}>
          Clear
        </button>
        <button type="button" onClick={onDelete} className={primaryBtn}>
          Delete selected
        </button>
      </div>
    </div>
  );
}

export default function WorkflowRunsClient({
  team,
  teams,
  teamNames,
  initialFilters,
}: {
  team: string;
  teams: { id: string; name: string }[];
  teamNames: Record<string, string>;
  initialFilters: RunFilterState;
}) {
  const [runs, setRuns] = useState<RunGraph[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<RunFacets>(NO_FACETS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<RunFilterState>(initialFilters);
  const [q, setQ] = useState(initialFilters.q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Typing shouldn't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(filters.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.q]);

  // Mirror the filters into the URL: a reload, a shared link, or a team switch
  // (which remounts this list) then shows what is on screen, not stale params.
  useEffect(() => {
    const url = new URL(window.location.href);
    const params: [string, string][] = [
      ["workflow", filters.workflow],
      ["status", filters.status],
      ["q", q.trim()],
      ["sort", filters.sort === "newest" ? "" : filters.sort],
    ];
    for (const [k, v] of params) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [filters.workflow, filters.status, filters.sort, q]);

  const load = useCallback(async () => {
    if (busyRef.current) return; // don't overwrite an in-flight decision or delete
    try {
      const out = await fetchJson<RunsResponse>(`/api/workflows/runs?${runsQuery(team, limit, filters, q)}`, {
        cache: "no-store",
      });
      setRuns(out.runs);
      setTotal(out.total);
      setFacets(out.facets ?? NO_FACETS);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [team, limit, filters, q]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const visibleKeys = useMemo(() => runs.map(runKey), [runs]);
  const selection = useRunSelection(visibleKeys);

  function changeFilters(next: RunFilterState) {
    setFilters(next);
    setLimit(PAGE_SIZE);
  }

  async function decide(run: RunGraph, node: GraphNode, action: Decision, note?: string) {
    busyRef.current = true;
    setBusyKey(runKey(run));
    setNotice(null);
    try {
      const out = await fetchJson<DecideResponse>("/api/teams/workflow-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: run.teamId,
          workflowId: run.workflowId,
          runId: run.runId,
          action: apiAction(action, note),
          ...(note ? { note } : {}),
        }),
      });
      setNotice(decisionNotice(run, node, action, note, out));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusyKey("");
      await load();
    }
  }

  async function deleteSelected() {
    busyRef.current = true;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const results = await Promise.all(
        deleteGroups(runs, selection.selected).map((g) =>
          fetchJson<{ ok: boolean; count?: number; errors?: string[] }>("/api/teams/workflow-runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ teamId: g.teamId, workflowId: g.workflowId, action: "bulk-delete", runIds: g.runIds }),
          }),
        ),
      );
      const errors = results.flatMap((r) => r.errors ?? []);
      if (errors.length) throw new Error(errors.join("; "));
      const deleted = results.reduce((n, r) => n + (r.count ?? 0), 0);
      selection.clear();
      setShowDelete(false);
      setNotice(`Deleted ${deleted} run${deleted === 1 ? "" : "s"}.`);
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setDeleteBusy(false);
      await load();
    }
  }

  const filtered = Boolean(filters.workflow || filters.status || q.trim());

  return (
    <div className="mt-3 space-y-4">
      <RunFilters
        team={team}
        teams={teams}
        onTeam={(id) => selectTeam(id)}
        facets={facets}
        value={filters}
        onChange={changeFilters}
      />

      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div>
      ) : null}

      {loading ? <p className="text-sm text-[color:var(--ck-text-tertiary)]">Loading runs…</p> : null}

      {!loading && runs.length > 0 ? (
        <ListHeader
          shown={runs.length}
          total={total}
          filtered={filtered}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
        />
      ) : null}

      {!loading && runs.length === 0 ? <EmptyState filtered={filtered} /> : null}

      {runs.map((run) => (
        <RunCard
          key={runKey(run)}
          run={run}
          teamName={teamNames[run.teamId] ?? run.teamId}
          selectedId={selectedNode[runKey(run)] ?? null}
          busy={busyKey === runKey(run)}
          checked={selection.selected.has(runKey(run))}
          onCheck={() => selection.toggle(runKey(run))}
          onSelect={(nodeId) => setSelectedNode((prev) => ({ ...prev, [runKey(run)]: nodeId }))}
          onDecide={(node, action, note) => void decide(run, node, action, note)}
        />
      ))}

      <ListFooter
        shown={runs.length}
        total={total}
        limit={limit}
        onMore={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
      />

      <BulkBar
        count={selection.count}
        onClear={selection.clear}
        onDelete={() => {
          setDeleteError(null);
          setShowDelete(true);
        }}
      />

      <ConfirmationModal
        open={showDelete}
        onClose={() => {
          setShowDelete(false);
          setDeleteError(null);
        }}
        title="Delete Workflow Runs"
        confirmLabel="Delete Runs"
        confirmBusyLabel="Deleting..."
        onConfirm={() => void deleteSelected()}
        busy={deleteBusy}
        error={deleteError}
      >
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Are you sure you want to permanently delete{" "}
          <strong className="text-[color:var(--ck-text-primary)]">
            {selection.count} run{selection.count === 1 ? "" : "s"}
          </strong>
          ? This action cannot be undone.
        </p>
      </ConfirmationModal>
    </div>
  );
}
