"use client";

import { useMemo, useState } from "react";

type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string };
  state?: { nextRunAtMs?: number };
};

export default function CronJobsClient() {
  const [teamId, setTeamId] = useState<string>("development-team-team");
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
      const res = await fetch(`/api/cron/recipe-installed?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setJobs(json.jobs ?? []);
      if ((json.jobs ?? []).length === 0) {
        setMsg("No recipe-installed cron jobs found for this team (or mapping file is missing).");
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, action: "enable" | "disable" | "run") {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/cron/job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setMsg(action === "run" ? "Triggered run." : "Updated.");
      await refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="ck-glass-strong p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label className="text-sm font-medium">Team id</label>
            <input
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm"
              placeholder="development-team-team"
            />
            <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              Team workspace is resolved as <code>workspace-&lt;teamId&gt;</code> next to agents.defaults.workspace.
            </div>
          </div>
          <div className="flex gap-2">
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
                <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
                  {j.schedule?.kind === "cron" ? j.schedule.expr : j.schedule?.kind ?? ""}
                  {" · "}
                  {j.enabled ? "enabled" : "disabled"}
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
