import { runOpenClaw } from "@/lib/openclaw";

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
    args.push("--enabled", data.enabled.toString());
  }
  
  // Schedule
  args.push("--schedule-kind", data.schedule.kind);
  
  if (data.schedule.expr) {
    args.push("--schedule-expr", data.schedule.expr);
  }
  
  if (data.schedule.everyMs) {
    args.push("--schedule-every-ms", data.schedule.everyMs.toString());
  }
  
  if (data.schedule.tz) {
    args.push("--schedule-tz", data.schedule.tz);
  }
  
  if (data.schedule.at) {
    args.push("--schedule-at", data.schedule.at);
  }
  
  // Delivery
  if (data.delivery?.mode) {
    args.push("--delivery-mode", data.delivery.mode);
    
    if (data.delivery.channel) {
      args.push("--delivery-channel", data.delivery.channel);
    }
    
    if (data.delivery.to) {
      args.push("--delivery-to", data.delivery.to);
    }
    
    if (data.delivery.bestEffort !== undefined) {
      args.push("--delivery-best-effort", data.delivery.bestEffort.toString());
    }
  }
  
  // Payload
  args.push("--payload-kind", data.payload.kind);
  
  if (data.payload.text) {
    args.push("--payload-text", data.payload.text);
  }
  
  if (data.payload.message) {
    args.push("--payload-message", data.payload.message);
  }
  
  if (data.payload.model) {
    args.push("--payload-model", data.payload.model);
  }
  
  if (data.payload.thinking) {
    args.push("--payload-thinking", data.payload.thinking);
  }
  
  if (data.payload.timeoutSeconds) {
    args.push("--payload-timeout-seconds", data.payload.timeoutSeconds.toString());
  }
  
  // Advanced
  if (data.agentId) {
    args.push("--agent-id", data.agentId);
  }
  
  if (data.sessionTarget) {
    args.push("--session-target", data.sessionTarget);
  }
  
  if (data.sessionKey) {
    args.push("--session-key", data.sessionKey);
  }

  return args;
}

export async function createCronJob(data: CronJobData): Promise<any> {
  const validationError = validateCronJobData(data);
  if (validationError) {
    throw new Error(validationError);
  }

  const args = ["cron", "add", ...buildCronJobArgs(data)];
  return await runOpenClaw(args);
}

export async function updateCronJob(id: string, data: CronJobData): Promise<any> {
  const validationError = validateCronJobData(data);
  if (validationError) {
    throw new Error(validationError);
  }

  const args = ["cron", "update", "--id", id, ...buildCronJobArgs(data)];
  return await runOpenClaw(args);
}