"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/errors";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { RunLoadingOverlay } from "@/components/RunLoadingOverlay";

type RunDetail = {
  id: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  meta?: unknown;
  memoryUsed?: unknown;
  approval?: unknown;
  raw?: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export default function WorkflowsClient({ teamId, llmTaskEnabled }: { teamId: string; llmTaskEnabled?: boolean }) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Array<{ id: string; name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");

  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string>("");
  const [runsByWorkflow, setRunsByWorkflow] = useState<Record<string, string[]>>({});
  const [runsLoading, setRunsLoading] = useState<Record<string, boolean>>({});
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [runError, setRunError] = useState<string>("");
  const [approvalNote, setApprovalNote] = useState<string>("");
  const [approvalBusy, setApprovalBusy] = useState<boolean>(false);

  // Run-from-list state: when the user clicks Run on a list row, we need to
  // (a) load the workflow to inspect meta.skipCronCheck, (b) check cron state,
  // (c) either enqueue the run or show a block modal advising to edit/skip.
  //
  // `runBusyFor` disables the row's button.
  // `runOverlayOpen` shows the full-screen "Gathering your ingredients" overlay
  // from the moment the user clicks Run through navigation to the run page. It
  // stays open on successful enqueue (the page unmount clears it naturally);
  // it closes on block-modal or error.
  const [runBusyFor, setRunBusyFor] = useState<string>("");
  const [runOverlayOpen, setRunOverlayOpen] = useState(false);
  const [runBlockWorkflowId, setRunBlockWorkflowId] = useState<string>("");
  const [runBlockMissing, setRunBlockMissing] = useState<string[]>([]);
  const [runBlockError, setRunBlockError] = useState<string>("");

  const runWorkflow = useCallback(
    async (workflowId: string) => {
      setRunBusyFor(workflowId);
      setRunOverlayOpen(true);
      setRunBlockError("");
      try {
        // 1. Load workflow to check meta.skipCronCheck + collect required agentIds
        const wfRes = await fetchJson<{ ok?: boolean; error?: string; workflow?: unknown }>(
          `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(workflowId)}`,
          { cache: "no-store" }
        );
        if (!wfRes.ok || !wfRes.workflow) throw new Error(wfRes.error || "Failed to load workflow");
        const wf = wfRes.workflow as {
          meta?: unknown;
          nodes?: Array<{ type?: string; config?: unknown }>;
        };
        const meta = isRecord(wf.meta) ? wf.meta : {};
        const skipCronCheck = meta.skipCronCheck === true;

        if (!skipCronCheck) {
          const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
          const requiredAgents = Array.from(
            new Set(
              nodes
                .filter((n) => n.type && !["start", "end", "human_approval"].includes(String(n.type)))
                .map((n) => {
                  const cfg = isRecord(n.config) ? n.config : {};
                  return String(cfg.agentId ?? "").trim();
                })
                .filter(Boolean)
            )
          );

          // 2. Fetch cron jobs and compute which required agents lack a worker-tick cron.
          const cronRes = await fetchJson<{ ok?: boolean; error?: string; jobs?: unknown[] }>(
            `/api/cron/jobs`,
            { cache: "no-store" }
          );
          if (!cronRes.ok) throw new Error(cronRes.error || "Failed to load cron jobs");
          const jobs = Array.isArray(cronRes.jobs) ? cronRes.jobs : [];
          const agentHasCron: Record<string, boolean> = {};
          for (const j of jobs) {
            const job = j as { enabled?: unknown; name?: unknown; payload?: { message?: unknown } };
            if (!job || !Boolean(job.enabled)) continue;
            const jobName = String(job.name ?? "");
            const payloadMsg = String(job.payload?.message ?? "");
            const isWorkerTick = jobName.startsWith("workflow-worker:") || payloadMsg.includes("worker-tick");
            if (!isWorkerTick) continue;
            const m = jobName.match(/^workflow-worker:[^:]+:(.+)$/);
            if (m?.[1]) {
              agentHasCron[m[1]] = true;
              continue;
            }
            const msgMatch = payloadMsg.match(/--agent-id\s+(\S+)/);
            if (msgMatch?.[1]) agentHasCron[msgMatch[1]] = true;
          }
          const missing = requiredAgents.filter((id) => !agentHasCron[id]);
          if (missing.length) {
            setRunOverlayOpen(false);
            setRunBusyFor("");
            setRunBlockMissing(missing);
            setRunBlockWorkflowId(workflowId);
            return;
          }
        }

        // 3. Enqueue the run.
        const runRes = await fetchJson<{ ok?: boolean; error?: string; runId?: string }>(
          `/api/teams/workflow-runs`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ teamId, workflowId, mode: "run_now" }),
          }
        );
        if (!runRes.ok) throw new Error(runRes.error || "Failed to create run");
        const newRunId = String(runRes.runId ?? "").trim();
        if (newRunId) {
          // Leave overlay open — page unmount on navigation will clear it,
          // avoiding a flash between fade-out and the run page render.
          router.push(`/teams/${encodeURIComponent(teamId)}/runs/${encodeURIComponent(workflowId)}/${encodeURIComponent(newRunId)}`);
          return;
        }
        // No runId returned — fall back to showing runs for the workflow inline.
        setExpandedWorkflowId(workflowId);
        setRunOverlayOpen(false);
        setRunBusyFor("");
      } catch (e: unknown) {
        setRunOverlayOpen(false);
        setRunBusyFor("");
        setRunBlockMissing([]);
        setRunBlockWorkflowId("");
        setRunBlockError(errorMessage(e));
      }
    },
    [teamId, router]
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = Boolean(opts?.quiet);
      setError("");
      if (!quiet) setLoading(true);
      try {
        const json = await fetchJson<{ ok?: boolean; files?: string[] }>(
          `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}`,
          { cache: "no-store" }
        );
        if (!json.ok) throw new Error("Failed to load workflows");
        const files = Array.isArray(json.files) ? json.files : [];
        const ids = files
          .map((f) => (f.endsWith(".workflow.json") ? f.slice(0, -".workflow.json".length) : null))
          .filter((id): id is string => Boolean(id));
        setWorkflows(ids.map((id) => ({ id, name: id })));
      } catch (e: unknown) {
        setError(errorMessage(e));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [teamId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm(`Delete workflow “${id}”? This removes the .workflow.json file from the team workspace.`)) return;
    setError("");
    try {
      const json = await fetchJson<{ ok?: boolean; error?: string }>(
        `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!json.ok) throw new Error(json.error || "Failed to delete workflow");
      await load({ quiet: true });
      if (expandedWorkflowId === id) {
        setExpandedWorkflowId("");
        setSelectedRunId("");
        setSelectedRun(null);
      }
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }

  async function loadRunsForWorkflow(workflowId: string) {
    setRunsLoading((s) => ({ ...s, [workflowId]: true }));
    setRunError("");
    try {
      const json = await fetchJson<{ ok?: boolean; runIds?: string[]; files?: string[]; error?: string }>(
        `/api/teams/workflow-runs?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(workflowId)}`,
        { cache: "no-store" }
      );
      if (!json.ok) throw new Error(json.error || "Failed to load runs");

      // New API: runIds (directory-per-run layout). Back-compat: files[] of *.run.json.
      const runIds = Array.isArray(json.runIds)
        ? json.runIds.map((x) => String(x || "").trim()).filter(Boolean)
        : Array.isArray(json.files)
          ? json.files
              .map((f) => (typeof f === "string" && f.endsWith(".run.json") ? f.slice(0, -".run.json".length) : null))
              .filter((x): x is string => Boolean(x))
          : [];

      setRunsByWorkflow((s) => ({ ...s, [workflowId]: runIds }));
    } catch (e: unknown) {
      setRunError(errorMessage(e));
      setRunsByWorkflow((s) => ({ ...s, [workflowId]: [] }));
    } finally {
      setRunsLoading((s) => ({ ...s, [workflowId]: false }));
    }
  }

  async function loadRunDetail(workflowId: string, runId: string) {
    setSelectedWorkflowId(workflowId);
    setSelectedRunId(runId);
    setSelectedRun(null);
    setRunError("");
    setApprovalNote("");
    try {
      const json = await fetchJson<{ ok?: boolean; run?: unknown; error?: string }>(
        `/api/teams/workflow-runs?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(workflowId)}&runId=${encodeURIComponent(runId)}`,
        { cache: "no-store" }
      );
      if (!json.ok) throw new Error(json.error || "Failed to load run");
      const run = isRecord(json.run) ? json.run : null;
      if (!run) throw new Error("Invalid run format");
      setSelectedRun({
        id: String(run.id ?? runId),
        status: typeof run.status === "string" ? run.status : undefined,
        startedAt: typeof run.startedAt === "string" ? run.startedAt : undefined,
        finishedAt: typeof (run as Record<string, unknown>).finishedAt === "string" ? String((run as Record<string, unknown>).finishedAt) : undefined,
        meta: (run as Record<string, unknown>).meta,
        memoryUsed: (run as Record<string, unknown>).memoryUsed,
        approval: (run as Record<string, unknown>).approval,
        raw: run,
      });
    } catch (e: unknown) {
      setRunError(errorMessage(e));
      setSelectedRun(null);
    }
  }

  async function onAddTemplate(templateId: string) {
    if (!confirm(`Add workflow from template “${templateId}”?`)) return;
    setError("");
    try {
      const json = await fetchJson<{ ok?: boolean; workflowId?: string; error?: string }>("/api/teams/workflow-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, templateId }),
      });
      if (!json.ok) throw new Error(json.error || "Failed to apply template");
      const workflowId = String(json.workflowId ?? "").trim();
      if (!workflowId) throw new Error("Template applied but workflowId missing");
      await load({ quiet: true });
      router.push(`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(workflowId)}`);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }
  const memoryUsedItems = useMemo(() => {
    const run = selectedRun;
    if (!run) return [] as Array<{ ts: string; author: string; type: string; content: string; source?: unknown }>;

    const raw = run.memoryUsed ?? (isRecord(run.meta) ? (run.meta as Record<string, unknown>).memoryUsed : undefined);
    if (!Array.isArray(raw)) return [];

    return raw
      .map((x) => (isRecord(x) ? x : null))
      .filter(Boolean)
      .map((o) => ({
        ts: String((o as Record<string, unknown>).ts ?? "").trim(),
        author: String((o as Record<string, unknown>).author ?? "").trim(),
        type: String((o as Record<string, unknown>).type ?? "").trim(),
        content: String((o as Record<string, unknown>).content ?? "").trim(),
        source: (o as Record<string, unknown>).source,
      }))
      .filter((it) => it.ts && it.author && it.type && it.content);
  }, [selectedRun]);

  if (loading) {
    return <div className="ck-card p-4">Loading workflows…</div>;
  }

  const llmHelp = llmTaskEnabled === false ? (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <div className="font-medium text-amber-200">LLM support is not enabled</div>
      <div className="mt-1 text-[color:var(--ck-text-secondary)]">
        Workflow LLM nodes require the optional built-in <code className="px-1">llm-task</code> plugin.
      </div>
      <div className="mt-2 text-[color:var(--ck-text-secondary)]">
        Enable it with: <code className="px-1">openclaw plugins enable llm-task</code> then run{' '}
        <code className="px-1">openclaw gateway restart</code>.
      </div>
      <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
        If you’re doing a non-interactive install, keep this command in your setup docs as a fallback.
      </div>
    </div>
  ) : null;

  return (
    <div className="ck-card p-6">
      <div>
        <h2 className="text-lg font-semibold">Workflows (file-first)</h2>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          Stored in <code>shared-context/workflows/&lt;id&gt;.workflow.json</code> inside the team workspace.
        </p>

        {llmHelp}

        <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
          <button
            type="button"
            onClick={() => {
              const id = `new-${Date.now()}`;
              router.push(`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(id)}?draft=1`);
            }}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
          >
            Add workflow
          </button>


          <button
            type="button"
            onClick={() => void onAddTemplate("marketing-cadence-v1")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Add example template
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {runBlockError ? (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {runBlockError}
        </div>
      ) : null}

      <ConfirmationModal
        open={Boolean(runBlockWorkflowId)}
        title="Worker crons not set up"
        confirmLabel="Edit workflow"
        onClose={() => {
          setRunBlockWorkflowId("");
          setRunBlockMissing([]);
        }}
        onConfirm={() => {
          const wfId = runBlockWorkflowId;
          setRunBlockWorkflowId("");
          setRunBlockMissing([]);
          if (wfId) router.push(`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(wfId)}`);
        }}
      >
        <div className="space-y-2 text-sm text-[color:var(--ck-text-secondary)]">
          <p>
            This workflow can’t run because worker cron jobs aren’t installed for the required agents. Open the
            workflow editor to install them, or choose to skip the cron check (once or permanently) from the same
            screen.
          </p>
          {runBlockMissing.length ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-[11px] text-[color:var(--ck-text-primary)]">
              Missing for: {runBlockMissing.join(", ")}
            </div>
          ) : null}
        </div>
      </ConfirmationModal>

      {workflows.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--ck-text-secondary)]">No workflows yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
          {workflows.map((w) => {
            const expanded = expandedWorkflowId === w.id;
            const runs = runsByWorkflow[w.id] ?? [];
            const isLoadingRuns = Boolean(runsLoading[w.id]);

            return (
              <li key={w.id} className="bg-white/5">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = expanded ? "" : w.id;
                      setExpandedWorkflowId(next);
                      setSelectedRunId("");
                      setSelectedRun(null);
                      setRunError("");
                      if (next) await loadRunsForWorkflow(next);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-medium text-[color:var(--ck-text-primary)]">{w.name || w.id}</div>
                    <div className="truncate text-xs text-[color:var(--ck-text-tertiary)]">{w.id}</div>
                    <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
                      Click to {expanded ? "collapse" : "expand"} run details
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={runBusyFor === w.id}
                      onClick={() => void runWorkflow(w.id)}
                      className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-50 transition-colors hover:bg-emerald-500/15 disabled:opacity-60"
                      title="Enqueue a run for this workflow"
                    >
                      {runBusyFor === w.id ? "Starting…" : "Run"}
                    </button>
                    <Link
                      href={`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(w.id)}`}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(w.id)}
                      className="rounded-lg border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Runs</div>
                      <button
                        type="button"
                        disabled={isLoadingRuns}
                        onClick={() => void loadRunsForWorkflow(w.id)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60"
                      >
                        {isLoadingRuns ? "Loading…" : "Refresh runs"}
                      </button>
                    </div>

                    {runError ? (
                      <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">{runError}</div>
                    ) : null}

                    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                        {runs.length ? (
                          <div className="space-y-1">
                            {runs.slice(0, 8).map((runId) => {
                              const selected = selectedRunId === runId;
                              return (
                                <button
                                  key={runId}
                                  type="button"
                                  onClick={() => void loadRunDetail(w.id, runId)}
                                  className={
                                    selected
                                      ? "w-full rounded-lg bg-white/10 px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-primary)]"
                                      : "w-full rounded-lg px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                                  }
                                >
                                  <span className="font-mono">{runId}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-[color:var(--ck-text-tertiary)]">No runs yet.</div>
                        )}
                      </div>

                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        {selectedRun ? (
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Run detail</div>
                              <div className="mt-1 text-[11px] text-[color:var(--ck-text-tertiary)]">
                                <span className="font-mono">{selectedRun.id}</span>
                                {selectedRun.status ? <span> • {selectedRun.status}</span> : null}
                              </div>
                            </div>

                            <div className="border-t border-white/10 pt-3">
                              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Approval</div>
                              {(() => {
                                const approval = selectedRun.approval;
                                if (!isRecord(approval)) {
                                  return <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">(No approval info recorded.)</div>;
                                }

                                const state = String(approval.state ?? "").trim();
                                const requestedAt = typeof approval.requestedAt === "string" ? approval.requestedAt : "";
                                const decidedAt = typeof approval.decidedAt === "string" ? approval.decidedAt : "";
                                const decidedBy = typeof approval.decidedBy === "string" ? approval.decidedBy : "";
                                const note = typeof approval.note === "string" ? approval.note : "";
                                const outbound = isRecord(approval.outbound) ? approval.outbound : null;

                                const canAct = state === "pending" || selectedRun.status === "waiting_for_approval";

                                return (
                                  <div className="mt-2 space-y-2">
                                    <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-[color:var(--ck-text-secondary)]">
                                      <div>
                                        <span className="font-mono">state</span>: <span className="font-mono text-[color:var(--ck-text-primary)]">{state || "(unknown)"}</span>
                                      </div>
                                      {requestedAt ? (
                                        <div>
                                          <span className="font-mono">requestedAt</span>: <span className="font-mono">{requestedAt}</span>
                                        </div>
                                      ) : null}
                                      {decidedAt ? (
                                        <div>
                                          <span className="font-mono">decidedAt</span>: <span className="font-mono">{decidedAt}</span>
                                        </div>
                                      ) : null}
                                      {decidedBy ? (
                                        <div>
                                          <span className="font-mono">decidedBy</span>: <span className="font-mono">{decidedBy}</span>
                                        </div>
                                      ) : null}
                                      {note ? (
                                        <div className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--ck-text-primary)]">{note}</div>
                                      ) : null}
                                      {outbound ? (
                                        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[10px]">
                                          <div className="text-[color:var(--ck-text-tertiary)]">Outbound</div>
                                          <pre className="mt-1 overflow-auto whitespace-pre-wrap">{JSON.stringify(outbound, null, 2)}</pre>
                                        </div>
                                      ) : null}
                                    </div>

                                    {canAct ? (
                                      <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                                        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">approval note (optional)</div>
                                        <textarea
                                          value={approvalNote}
                                          onChange={(e) => setApprovalNote(e.target.value)}
                                          rows={3}
                                          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                          placeholder="e.g. Ship it / please tweak hook"
                                        />
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {([
                                            { action: "approve", label: "Approve" },
                                            { action: "request_changes", label: "Request changes" },
                                            { action: "cancel", label: "Cancel" },
                                          ] as const).map((btn) => (
                                            <button
                                              key={btn.action}
                                              type="button"
                                              disabled={approvalBusy}
                                              onClick={async () => {
                                                if (!selectedWorkflowId || !selectedRunId) return;
                                                if (!confirm(`${btn.label} run ${selectedRunId}?`)) return;
                                                setApprovalBusy(true);
                                                setRunError("");
                                                try {
                                                  const res = await fetch("/api/teams/workflow-runs", {
                                                    method: "POST",
                                                    headers: { "content-type": "application/json" },
                                                    body: JSON.stringify({
                                                      teamId,
                                                      workflowId: selectedWorkflowId,
                                                      runId: selectedRunId,
                                                      action: btn.action,
                                                      note: approvalNote || undefined,
                                                      decidedBy: "ClawKitchen UI",
                                                    }),
                                                  });
                                                  const json = await res.json();
                                                  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to apply approval action");
                                                  await loadRunDetail(selectedWorkflowId, selectedRunId);
                                                } catch (e: unknown) {
                                                  setRunError(errorMessage(e));
                                                } finally {
                                                  setApprovalBusy(false);
                                                }
                                              }}
                                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60"
                                            >
                                              {btn.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="border-t border-white/10 pt-3">
                              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Memory used in this run</div>
                              {memoryUsedItems.length ? (
                                <div className="mt-2 space-y-2">
                                  {memoryUsedItems.slice(0, 20).map((m, idx) => (
                                    <div key={`${m.ts}-${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                                      <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                                        <span className="font-mono">{m.ts}</span> • <span className="font-mono">{m.type}</span> • <span className="font-mono">{m.author}</span>
                                      </div>
                                      <div className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--ck-text-primary)]">{m.content}</div>
                                      {m.source !== undefined ? (
                                        <pre className="mt-2 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-[color:var(--ck-text-secondary)]">
                                          {JSON.stringify(m.source, null, 2)}
                                        </pre>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                                  (None recorded yet.)
                                  <div className="mt-1">Next step: have the workflow runner write an explicit <span className="font-mono">memoryUsed[]</span> list into the run file.</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : selectedRunId ? (
                          <div className="text-xs text-[color:var(--ck-text-secondary)]">Loading run…</div>
                        ) : (
                          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Select a run to see details.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <RunLoadingOverlay open={runOverlayOpen} />
    </div>
  );
}
