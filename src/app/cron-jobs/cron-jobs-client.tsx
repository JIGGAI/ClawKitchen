"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { DeleteCronJobModal } from "./DeleteCronJobModal";

type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; everyMs?: number; tz?: string };
  state?: { nextRunAtMs?: number };
  agentId?: string;
  sessionTarget?: string;
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

export default function CronJobsClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>("");
  const [deleteLabel, setDeleteLabel] = useState<string>("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const ae = Boolean(a.enabled);
      const be = Boolean(b.enabled);
      if (ae !== be) return ae ? -1 : 1; // enabled first
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }, [jobs]);

  async function refresh() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/cron/jobs", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; jobs?: CronJob[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setJobs(json.jobs ?? []);
      if ((json.jobs ?? []).length === 0) {
        setMsg("No cron jobs found.");
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function act(id: string, action: "enable" | "disable" | "run") {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/cron/job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Action failed");
      setMsg(action === "run" ? "Triggered run." : "Updated.");
      await refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
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

  async function confirmDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/cron/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Delete failed");
      toast.push({ kind: "success", message: `Removed cron job: ${deleteLabel}` });
      setDeleteOpen(false);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div>
        <div className="ck-glass-strong p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">All Cron Jobs</h2>
            <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
              {jobs.length} job{jobs.length !== 1 ? "s" : ""} total · {jobs.filter((j) => j.enabled).length} enabled
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
          >
            Refresh
          </button>
        </div>
      </div>

      {msg ? (
        <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm">
          {msg}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {sorted.map((j) => (
          <div key={j.id} className="ck-glass px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate font-medium">{j.name ?? j.id}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--ck-text-secondary)]">
                  <span>{fmtSchedule(j.schedule)}</span>
                  <span>{j.enabled ? "✅ enabled" : "⏸ disabled"}</span>
                  {j.agentId ? <span>agent: {j.agentId}</span> : null}
                  {j.scope ? (
                    <span>
                      {j.scope.kind}: {" "}
                      <a className="underline hover:no-underline" href={j.scope.href}>
                        {j.scope.label}
                      </a>
                    </span>
                  ) : null}
                  {j.sessionTarget ? <span>target: {j.sessionTarget}</span> : null}
                  {j.state?.nextRunAtMs ? (
                    <span>next: {new Date(j.state.nextRunAtMs).toLocaleString()}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act(j.id, j.enabled ? "disable" : "enable")}
                  disabled={loading}
                  className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
                >
                  {j.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => act(j.id, "run")}
                  disabled={loading}
                  className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)]"
                >
                  Run now
                </button>
                <button
                  type="button"
                  title={j.enabled ? "Disable this job before deleting." : "Delete cron job"}
                  onClick={() => openDelete(j)}
                  disabled={loading || Boolean(j.enabled)}
                  className="rounded-[var(--ck-radius-sm)] border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/15 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

      <DeleteCronJobModal
        open={deleteOpen}
        jobLabel={deleteLabel}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
