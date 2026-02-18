/**
 * Shared shape for cron job objects returned by the gateway cron tool.
 * Different callers may receive slightly different structures; these helpers normalize access.
 */
export type CronJobShape = {
  id?: unknown;
  jobId?: unknown;
  name?: unknown;
  enabled?: unknown;
  state?: { enabled?: unknown };
};

/** Typed cron job for UI display. API returns jobs that match this structure. */
export type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; everyMs?: number };
  state?: { nextRunAtMs?: number };
  agentId?: string;
  sessionTarget?: string;
};

export function cronJobId(j: CronJobShape): string {
  return String(j.id ?? j.jobId ?? "").trim();
}

export function cronJobLabel(j: CronJobShape): string {
  return String(j.name ?? j.id ?? j.jobId ?? "(unnamed)");
}

export function fmtCronSchedule(s?: CronJob["schedule"]): string {
  if (!s) return "";
  if (s.kind === "cron" && s.expr) return s.expr;
  if (s.kind === "every" && s.everyMs) {
    const mins = Math.round(s.everyMs / 60000);
    return mins >= 60 ? `every ${Math.round(mins / 60)}h` : `every ${mins}m`;
  }
  return s.kind ?? "";
}
