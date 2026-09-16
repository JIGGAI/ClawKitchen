"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RunGraphSvg from "@/components/workflows/RunGraphSvg";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import type { GraphNode, RunGraph } from "@/lib/workflows/run-graph";

/**
 * Every run, drawn as its graph. A run waiting on a person is the case this
 * exists for, so the approval is answerable here.
 */

const POLL_MS = 5000;
const PAGE_SIZE = 20;
const MAX_LIMIT = 200;

type RunsResponse = { ok: true; runs: RunGraph[]; total: number };
type DecideResponse = { ok: true; resumeError?: string };
type Decision = "approve" | "request_changes";

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

function decisionNotice(run: RunGraph, node: GraphNode, action: Decision, out: DecideResponse): string {
  if (out.resumeError) return `Recorded, but the run did not resume: ${out.resumeError}`;
  if (action === "approve") return `Approved ${node.name ?? node.id} — resuming ${run.workflowName ?? run.workflowId}.`;
  return `Changes requested on ${node.name ?? node.id}.`;
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
  onDecide: (action: Decision) => void;
}) {
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
      {canDecide ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => onDecide("approve")}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onDecide("request_changes")}>
            Request changes
          </button>
          <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">The run resumes once the decision is recorded.</span>
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
  onSelect,
  onDecide,
}: {
  run: RunGraph;
  teamName: string;
  selectedId: string | null;
  busy: boolean;
  onSelect: (nodeId: string) => void;
  onDecide: (node: GraphNode, action: Decision) => void;
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
        <Link href={runHref} className="shrink-0 text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          open run →
        </Link>
      </div>

      <div className="mt-3">
        <RunGraphSvg run={run} selected={currentId} onSelect={onSelect} />
      </div>

      {node ? <NodeDetail run={run} node={node} busy={busy} onDecide={(action) => onDecide(node, action)} /> : null}
    </div>
  );
}

export default function WorkflowRunsClient({ team, teamNames }: { team: string; teamNames: Record<string, string> }) {
  const [runs, setRuns] = useState<RunGraph[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return; // don't overwrite an in-flight decision
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (team) qs.set("team", team);
      const out = await fetchJson<RunsResponse>(`/api/workflows/runs?${qs.toString()}`, { cache: "no-store" });
      setRuns(out.runs);
      setTotal(out.total);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [team, limit]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function decide(run: RunGraph, node: GraphNode, action: Decision) {
    busyRef.current = true;
    setBusyKey(runKey(run));
    setNotice(null);
    try {
      const out = await fetchJson<DecideResponse>("/api/teams/workflow-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: run.teamId, workflowId: run.workflowId, runId: run.runId, action }),
      });
      setNotice(decisionNotice(run, node, action, out));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusyKey("");
      await load();
    }
  }

  if (loading) {
    return <p className="mt-3 text-sm text-[color:var(--ck-text-tertiary)]">Loading runs…</p>;
  }

  return (
    <div className="mt-3 space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div>
      ) : null}

      {runs.length === 0 ? (
        <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
          No runs yet. Start one from a team&apos;s Workflows tab, or let a cron trigger fire it.
        </div>
      ) : null}

      {runs.map((run) => (
        <RunCard
          key={runKey(run)}
          run={run}
          teamName={teamNames[run.teamId] ?? run.teamId}
          selectedId={selected[runKey(run)] ?? null}
          busy={busyKey === runKey(run)}
          onSelect={(nodeId) => setSelected((prev) => ({ ...prev, [runKey(run)]: nodeId }))}
          onDecide={(node, action) => void decide(run, node, action)}
        />
      ))}

      {runs.length < total && limit < MAX_LIMIT ? (
        <button type="button" className={secondaryBtn} onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}>
          Load more ({runs.length} of {total})
        </button>
      ) : null}
      {runs.length < total && limit >= MAX_LIMIT ? (
        <p className="text-xs text-[color:var(--ck-text-tertiary)]">
          Showing the newest {runs.length} of {total}. See <Link href="/runs" className="hover:underline">Runs</Link> for the full history.
        </p>
      ) : null}
    </div>
  );
}
