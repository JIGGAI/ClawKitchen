"use client";

type CronJob = {
  id?: unknown;
  jobId?: unknown;
  name?: unknown;
  enabled?: unknown;
  state?: { enabled?: unknown };
};

type TeamCronTabProps = {
  cronJobs: unknown[];
  cronLoading: boolean;
  saving: boolean;
  onCronAction: (id: string, label: string, action: "enable" | "disable" | "run") => Promise<void>;
};

export function TeamCronTab(props: TeamCronTabProps) {
  const { cronJobs, cronLoading, saving, onCronAction } = props;
  return (
    <div className="mt-6 ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Cron jobs (filtered by team name)</div>
      <ul className="mt-3 space-y-3">
        {cronJobs.length ? (
          cronJobs.map((j) => {
            const job = j as CronJob;
            const id = String(job.id ?? job.jobId ?? "").trim();
            const key = id || String(job.name ?? "job");
            const label = String(job.name ?? job.id ?? job.jobId ?? "(unnamed)");
            const enabled = job.enabled ?? job.state?.enabled;
            return (
              <li key={key} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-medium text-[color:var(--ck-text-primary)]">{label}</div>
                <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">Enabled: {String(enabled ?? "?")}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={saving || !id}
                    onClick={() => onCronAction(id, label, "run")}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                  >
                    Run
                  </button>
                  <button
                    disabled={saving || !id}
                    onClick={() => onCronAction(id, label, "enable")}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                  >
                    Enable
                  </button>
                  <button
                    disabled={saving || !id}
                    onClick={() => onCronAction(id, label, "disable")}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                  >
                    Disable
                  </button>
                  {!id ? <div className="text-xs text-[color:var(--ck-text-tertiary)]">(missing id)</div> : null}
                </div>
              </li>
            );
          })
        ) : null}
        {cronJobs.length === 0 && cronLoading && (
          <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading</li>
        )}
        {cronJobs.length === 0 && !cronLoading && (
          <li className="text-sm text-[color:var(--ck-text-secondary)]">No cron jobs detected for this team.</li>
        )}
      </ul>
    </div>
  );
}
