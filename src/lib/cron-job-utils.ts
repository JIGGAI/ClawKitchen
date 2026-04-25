import { runOpenClaw, type OpenClawExecResult } from "@/lib/openclaw";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";
import { refreshAllTeamCronCaches } from "@/lib/team-cron-cache";

export interface CronJobData {
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule: {
    kind: "cron" | "every" | "at";
    expr?: string;
    everyMs?: number;
    tz?: string;
    at?: string;
  };
  delivery?: {
    mode?: "none" | "announce" | "webhook";
    channel?: string;
    to?: string;
    bestEffort?: boolean;
  };
  payload: {
    kind: "systemEvent" | "agentTurn";
    text?: string;
    message?: string;
    model?: string;
    thinking?: string;
    timeoutSeconds?: number;
  };
  agentId?: string;
  sessionTarget?: string;
  sessionKey?: string;
}

export function validateCronJobData(data: CronJobData): string | null {
  if (!data.schedule?.kind) {
    return "Schedule kind is required";
  }

  if (data.schedule.kind === "cron" && !data.schedule.expr) {
    return "Cron expression is required for cron schedule";
  }

  if (data.schedule.kind === "every" && !data.schedule.everyMs) {
    return "Interval is required for every schedule";
  }

  if (data.schedule.kind === "at" && !data.schedule.at) {
    return "At time is required for at schedule";
  }

  if (!data.payload?.kind) {
    return "Payload kind is required";
  }

  if (data.payload.kind === "systemEvent" && !data.payload.text) {
    return "Text is required for system event payload";
  }

  if (data.payload.kind === "agentTurn" && !data.payload.message) {
    return "Message is required for agent turn payload";
  }

  return null;
}

function buildCronJobArgs(data: CronJobData): string[] {
  const args: string[] = [];

  if (data.name) {
    args.push("--name", data.name);
  }

  if (data.description) {
    args.push("--description", data.description);
  }

  if (data.enabled !== undefined) {
    args.push(data.enabled ? "--enable" : "--disable");
  }

  // Schedule
  if (data.schedule.kind === "cron" && data.schedule.expr) {
    args.push("--cron", data.schedule.expr);
    if (data.schedule.tz) args.push("--tz", data.schedule.tz);
  }

  if (data.schedule.kind === "every" && data.schedule.everyMs) {
    const ms = data.schedule.everyMs;
    if (ms % 86400000 === 0) args.push("--every", `${ms / 86400000}d`);
    else if (ms % 3600000 === 0) args.push("--every", `${ms / 3600000}h`);
    else if (ms % 60000 === 0) args.push("--every", `${ms / 60000}m`);
    else args.push("--every", `${Math.round(ms / 1000)}s`);
  }

  if (data.schedule.kind === "at" && data.schedule.at) {
    args.push("--at", data.schedule.at);
  }

  // Delivery
  if (data.delivery?.mode === "none") {
    args.push("--no-deliver");
  } else if (data.delivery?.mode === "announce") {
    args.push("--announce");
    if (data.delivery.channel) args.push("--channel", data.delivery.channel);
    if (data.delivery.to) args.push("--to", data.delivery.to);
    if (data.delivery.bestEffort !== undefined) {
      args.push(data.delivery.bestEffort ? "--best-effort-deliver" : "--no-best-effort-deliver");
    }
  }

  // Payload
  if (data.payload.kind === "systemEvent") {
    args.push("--system-event", data.payload.text ?? "");
  } else {
    args.push("--message", data.payload.message ?? "");
    if (data.payload.model) args.push("--model", data.payload.model);
    if (data.payload.thinking) args.push("--thinking", data.payload.thinking);
    if (data.payload.timeoutSeconds) args.push("--timeout-seconds", data.payload.timeoutSeconds.toString());
  }

  // Advanced
  if (data.agentId) {
    args.push("--agent", data.agentId);
  }

  if (data.sessionTarget) {
    args.push("--session", data.sessionTarget);
  }

  if (data.sessionKey) {
    args.push("--session-key", data.sessionKey);
  }

  return args;
}

export async function createCronJob(data: CronJobData): Promise<OpenClawExecResult> {
  const validationError = validateCronJobData(data);
  if (validationError) {
    throw new Error(validationError);
  }

  const args = ["cron", "add", ...buildCronJobArgs(data)];
  const result = await runOpenClaw(args);
  if (result.ok) {
    invalidateOpenClawCache(["cron", "list"]);
    refreshAllTeamCronCaches().catch(() => {});
  }
  return result;
}

export async function updateCronJob(id: string, data: CronJobData): Promise<OpenClawExecResult> {
  const validationError = validateCronJobData(data);
  if (validationError) {
    throw new Error(validationError);
  }

  // IMPORTANT:
  // OpenClaw CLI uses `cron edit <id> [flags...]` for patch-style updates.
  // The `cron update` subcommand does not accept our `--payload-*` flag set,
  // so edits like `payload.model` would silently fail to persist.
  const args = ["cron", "edit", id, ...buildCronJobArgs(data)];
  const result = await runOpenClaw(args);
  if (result.ok) {
    invalidateOpenClawCache(["cron", "list"]);
    refreshAllTeamCronCaches().catch(() => {});
  }
  return result;
}