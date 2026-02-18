"use client";

import { useEffect, useMemo, useState } from "react";
import { type CronJob, fmtCronSchedule } from "@/lib/cron";
import { errorMessage } from "@/lib/errors";

export default function CronJobsClient() {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [msg, setMsg] = useState<string>("");

  const sorted = useMemo(() => {
    return [...jobs].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
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
      setMsg(errorMessage(e));
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
      setMsg(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
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
                  <span>{fmtCronSchedule(j.schedule)}</span>
                  <span>{j.enabled ? "✅ enabled" : "⏸ disabled"}</span>
                  {j.agentId ? <span>agent: {j.agentId}</span> : null}
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
