"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { DeleteCronJobModal } from "@/components/delete-modals";
import { EditCronJobModal } from "@/components/EditCronJobModal";
import { CreateCronJobModal } from "@/components/CreateCronJobModal";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { useRunSelection } from "@/hooks/useRunSelection";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";

type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; everyMs?: number; tz?: string };
  state?: { nextRunAtMs?: number };
  agentId?: string;
  sessionTarget?: string;
  sessionKey?: string;
  // Optional enrichment from the API (which team/agent it belongs to)
  scope?: { kind: "team" | "agent"; id: string; label: string; href: string };
};

function fmtSchedule(s?: CronJob["schedule"]): string {
  if (!s) return "";
  if (s.kind === "cron" && s.expr) return s.expr;
  if (s.kind === "every" && s.everyMs) {
    const mins = Math.round(s.everyMs / 60000);
    return mins >= 60 ? `every ${Math.round(mins / 60)}h` : `every ${mins}m`;
  }
  return s.kind ?? "";
}

function isEnabled(j: CronJob): boolean {
  // Some responses put enabled under state.enabled.
  return Boolean(j.enabled ?? (j as { state?: { enabled?: unknown } }).state?.enabled);
}

export default function CronJobsClient({ teamId }: { teamId: string | null }) {
  const toast = useToast();
  const teamFilter = (teamId ?? "").trim();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>("");
  const [deleteLabel, setDeleteLabel] = useState<string>("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editJob, setEditJob] = useState<CronJob | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  // Bulk action state
  type BulkAction = "enable" | "disable" | "delete";
  const [bulkModalAction, setBulkModalAction] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const ae = isEnabled(a);
      const be = isEnabled(b);
      if (ae !== be) return ae ? -1 : 1; // enabled first
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }, [jobs]);

  const visibleIds = useMemo(() => sorted.map((j) => j.id), [sorted]);
  const { selected, toggle, allSelected, toggleAll, clear, count } = useRunSelection(visibleIds);

  const selectedEnabledCount = useMemo(
    () => sorted.filter((j) => selected.has(j.id) && isEnabled(j)).length,
    [sorted, selected],
  );
  const selectedDisabledCount = useMemo(
    () => sorted.filter((j) => selected.has(j.id) && !isEnabled(j)).length,
    [sorted, selected],
  );

  function openBulkModal(action: BulkAction) {
    setBulkError(null);
    setBulkModalAction(action);
  }

  async function confirmBulkAction() {
    if (!bulkModalAction) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const ids = Array.from(selected);
      const json = await fetchJson<{ ok?: boolean; errors?: Array<{ id: string; error?: string }> }>(
        "/api/cron/bulk",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids, action: bulkModalAction }),
        },
      );
      if (!json.ok) {
        const errMsg = json.errors?.map((e) => `${e.id}: ${e.error}`).join("; ") || "Bulk action failed";
        throw new Error(errMsg);
      }
      const label = bulkModalAction === "delete" ? "Deleted" : bulkModalAction === "enable" ? "Enabled" : "Disabled";
      toast.push({ kind: "success", message: `${label} ${ids.length} cron job${ids.length !== 1 ? "s" : ""}.` });
      clear();
      setBulkModalAction(null);
      await refresh();
    } catch (e: unknown) {
      const msg = errorMessage(e);
      setBulkError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setBulkBusy(false);
    }
  }

  const liveEditJob = useMemo(() => {
    if (!editJob) return null;
    return jobs.find((job) => job.id === editJob.id) ?? editJob;
  }, [jobs, editJob]);

  async function refresh() {
    setLoading(true);
    setMsg("");
    try {
      const url = teamFilter ? `/api/cron/jobs?teamId=${encodeURIComponent(teamFilter)}` : "/api/cron/jobs";
      const json = await fetchJson<{ jobs?: CronJob[] }>(url, { cache: "no-store" });
      setJobs(json.jobs ?? []);
      if ((json.jobs ?? []).length === 0) {
        setMsg("No cron jobs found.");
      }
    } catch (e: unknown) {
      setMsg(errorMessage(e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh closes over teamFilter
  }, [teamFilter]);

  async function act(id: string, action: "enable" | "disable" | "run") {
    setLoading(true);
    setMsg("");
    try {
      await fetchJson("/api/cron/job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setMsg(action === "run" ? "Triggered run." : "Updated.");
      await refresh();
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function openDelete(job: CronJob) {
    setDeleteId(job.id);
    setDeleteLabel(job.name ?? job.id);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function openEdit(job: CronJob) {
    setEditJob(job);
    setEditOpen(true);
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const json = await fetchJson<{ ok?: boolean; error?: string }>("/api/cron/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      if (!json.ok) throw new Error(json.error || "Delete failed");
      toast.push({ kind: "success", message: `Removed cron job: ${deleteLabel}` });
      setDeleteOpen(false);
      await refresh();
    } catch (e: unknown) {
      const msg = errorMessage(e);
      setDeleteError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div>
        <div className="ck-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {sorted.length > 0 && (
              <input
                type="checkbox"
                checked={allSelected && sorted.length > 0}
                onChange={toggleAll}
                className="accent-[var(--ck-accent-red)]"
                aria-label="Select all cron jobs"
              />
            )}
            <div>
              <h2 className="text-lg font-semibold">All Cron Jobs</h2>
              <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
                {jobs.length} job{jobs.length !== 1 ? "s" : ""} total · {jobs.filter((j) => isEnabled(j)).length} enabled
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)]"
            >
              Create Job
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {msg ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          {msg}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {sorted.map((j) => (
          <div key={j.id} className="ck-card px-4 py-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(j.id)}
                onChange={() => toggle(j.id)}
                className="mt-1.5 shrink-0 accent-[var(--ck-accent-red)]"
                aria-label={`Select ${j.name ?? j.id}`}
              />
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId((cur) => (cur === j.id ? null : j.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedId((cur) => (cur === j.id ? null : j.id));
                }
              }}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.name ?? j.id}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--ck-text-secondary)]">
                    <span>{fmtSchedule(j.schedule)}</span>
                    <span>{isEnabled(j) ? "✅ enabled" : "⏸ disabled"}</span>
                    {j.agentId ? <span>agent: {j.agentId}</span> : null}
                    {j.scope ? (
                      <span>
                        {j.scope.kind}: {" "}
                        <a
                          className="underline hover:no-underline"
                          href={j.scope.href}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {j.scope.label}
                        </a>
                      </span>
                    ) : null}
                    {j.sessionTarget ? <span>target: {j.sessionTarget}</span> : null}
                    {j.state?.nextRunAtMs ? <span>next: {new Date(j.state.nextRunAtMs).toLocaleString()}</span> : null}
                  </div>
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => openEdit(j)}
                    disabled={loading}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => act(j.id, isEnabled(j) ? "disable" : "enable")}
                    disabled={loading}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
                  >
                    {isEnabled(j) ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(j.id, "run")}
                    disabled={loading}
                    className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)]"
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    title={isEnabled(j) ? "Disable this job before deleting." : "Delete cron job"}
                    onClick={() => openDelete(j)}
                    disabled={loading || isEnabled(j)}
                    className="rounded-lg border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)] disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {expandedId === j.id ? (
              <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-[color:var(--ck-text-primary)]">
                {JSON.stringify(j, null, 2)}
              </pre>
            ) : null}
          </div>
          </div>
        ))}
      </div>
    </div>

      {count > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/80 backdrop-blur-md px-4 py-3 shadow-lg">
          <span className="text-sm text-[color:var(--ck-text-secondary)]">
            {count} job{count !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
            >
              Clear
            </button>
            {selectedDisabledCount > 0 && (
              <button
                type="button"
                onClick={() => openBulkModal("enable")}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Enable{selectedDisabledCount < count ? ` (${selectedDisabledCount})` : ""}
              </button>
            )}
            {selectedEnabledCount > 0 && (
              <button
                type="button"
                onClick={() => openBulkModal("disable")}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Disable{selectedEnabledCount < count ? ` (${selectedEnabledCount})` : ""}
              </button>
            )}
            <button
              type="button"
              onClick={() => openBulkModal("delete")}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ck-accent-red-hover)]"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={bulkModalAction !== null}
        onClose={() => { setBulkModalAction(null); setBulkError(null); }}
        title={
          bulkModalAction === "delete" ? "Delete Cron Jobs"
            : bulkModalAction === "enable" ? "Enable Cron Jobs"
            : "Disable Cron Jobs"
        }
        confirmLabel={
          bulkModalAction === "delete" ? "Delete"
            : bulkModalAction === "enable" ? "Enable"
            : "Disable"
        }
        confirmBusyLabel={
          bulkModalAction === "delete" ? "Deleting..."
            : bulkModalAction === "enable" ? "Enabling..."
            : "Disabling..."
        }
        onConfirm={confirmBulkAction}
        busy={bulkBusy}
        error={bulkError}
        confirmButtonClassName={
          bulkModalAction === "delete"
            ? undefined
            : "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
        }
      >
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          {bulkModalAction === "delete" ? (
            <>
              Are you sure you want to permanently delete{" "}
              <strong className="text-[color:var(--ck-text-primary)]">{count} cron job{count !== 1 ? "s" : ""}</strong>?
              This action cannot be undone.
            </>
          ) : bulkModalAction === "enable" ? (
            <>
              Enable{" "}
              <strong className="text-[color:var(--ck-text-primary)]">{selectedDisabledCount} cron job{selectedDisabledCount !== 1 ? "s" : ""}</strong>?
              {selectedEnabledCount > 0 && (
                <span> ({selectedEnabledCount} already enabled will be skipped.)</span>
              )}
            </>
          ) : (
            <>
              Disable{" "}
              <strong className="text-[color:var(--ck-text-primary)]">{selectedEnabledCount} cron job{selectedEnabledCount !== 1 ? "s" : ""}</strong>?
              {selectedDisabledCount > 0 && (
                <span> ({selectedDisabledCount} already disabled will be skipped.)</span>
              )}
            </>
          )}
        </p>
      </ConfirmationModal>

      <DeleteCronJobModal
        open={deleteOpen}
        jobLabel={deleteLabel}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />

      <EditCronJobModal
        job={liveEditJob}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={refresh}
      />

      <CreateCronJobModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </>
  );
}
