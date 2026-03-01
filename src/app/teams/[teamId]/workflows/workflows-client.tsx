"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/errors";

type RunDetail = {
  id: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  meta?: unknown;
  memoryUsed?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export default function WorkflowsClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Array<{ id: string; name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");

  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string>("");
  const [runsByWorkflow, setRunsByWorkflow] = useState<Record<string, string[]>>({});
  const [runsLoading, setRunsLoading] = useState<Record<string, boolean>>({});
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [runError, setRunError] = useState<string>("");

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
      const json = await fetchJson<{ ok?: boolean; files?: string[]; error?: string }>(
        `/api/teams/workflow-runs?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(workflowId)}`,
        { cache: "no-store" }
      );
      if (!json.ok) throw new Error(json.error || "Failed to load runs");
      const files = Array.isArray(json.files) ? json.files : [];
      const runIds = files
        .map((f) => (typeof f === "string" && f.endsWith(".run.json") ? f.slice(0, -".run.json".length) : null))
        .filter((x): x is string => Boolean(x));
      setRunsByWorkflow((s) => ({ ...s, [workflowId]: runIds }));
    } catch (e: unknown) {
      setRunError(errorMessage(e));
      setRunsByWorkflow((s) => ({ ...s, [workflowId]: [] }));
    } finally {
      setRunsLoading((s) => ({ ...s, [workflowId]: false }));
    }
  }

  async function loadRunDetail(workflowId: string, runId: string) {
    setSelectedRunId(runId);
    setSelectedRun(null);
    setRunError("");
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
        finishedAt: typeof run.finishedAt === "string" ? run.finishedAt : undefined,
        meta: run.meta,
        memoryUsed: (run as Record<string, unknown>).memoryUsed,
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
    return <div className="ck-glass p-4">Loading workflows…</div>;
  }

  return (
    <div className="ck-glass p-6">
      <div>
        <h2 className="text-lg font-semibold">Workflows (file-first)</h2>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          Stored in <code>shared-context/workflows/&lt;id&gt;.workflow.json</code> inside the team workspace.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
          <button
            type="button"
            onClick={() => {
              const id = `new-${Date.now()}`;
              router.push(`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(id)}?draft=1`);
            }}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
          >
            Add workflow
          </button>


          <button
            type="button"
            onClick={() => void onAddTemplate("marketing-cadence-v1")}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Add Marketing Cadence template
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {workflows.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--ck-text-secondary)]">No workflows yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-[var(--ck-radius-sm)] border border-white/10">
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
                    <Link
                      href={`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(w.id)}`}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(w.id)}
                      className="rounded-[var(--ck-radius-sm)] border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Runs</div>
                      <button
                        type="button"
                        disabled={isLoadingRuns}
                        onClick={() => void loadRunsForWorkflow(w.id)}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60"
                      >
                        {isLoadingRuns ? "Loading…" : "Refresh runs"}
                      </button>
                    </div>

                    {runError ? (
                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">{runError}</div>
                    ) : null}

                    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-2">
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
                                      ? "w-full rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-primary)]"
                                      : "w-full rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-secondary)] hover:bg-white/5"
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

                      <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
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
                              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Memory used in this run</div>
                              {memoryUsedItems.length ? (
                                <div className="mt-2 space-y-2">
                                  {memoryUsedItems.slice(0, 20).map((m, idx) => (
                                    <div key={`${m.ts}-${idx}`} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2">
                                      <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                                        <span className="font-mono">{m.ts}</span> • <span className="font-mono">{m.type}</span> • <span className="font-mono">{m.author}</span>
                                      </div>
                                      <div className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--ck-text-primary)]">{m.content}</div>
                                      {m.source !== undefined ? (
                                        <pre className="mt-2 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 text-[10px] text-[color:var(--ck-text-secondary)]">
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
    </div>
  );
}
