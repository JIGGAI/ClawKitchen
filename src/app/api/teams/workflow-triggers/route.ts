import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";
import { createSpecHash } from "@/lib/spec-hash-utils";
import type { WorkflowTriggerCronV1 } from "@/lib/workflows/types";

// ---------------------------------------------------------------------------
// Provenance format — matches ClawRecipes CronMappingStateV1 so both systems
// read/write the same file and never create duplicates.
// ---------------------------------------------------------------------------
type MappingStateV1 = {
  version: 1;
  entries: Record<string, {
    installedCronId: string;
    specHash?: string;
    orphaned?: boolean;
    updatedAtMs?: number;
  }>;
};

/**
 * Provenance key for workflow triggers
 * Format: team:{teamId}:workflow:{workflowId}:trigger:{triggerId}
 */
function triggerKey(teamId: string, workflowId: string, triggerId: string) {
  return `team:${teamId}:workflow:${workflowId}:trigger:${triggerId}`;
}

/**
 * Cron job name for workflow triggers
 */
function triggerCronName(teamId: string, workflowId: string, triggerId: string) {
  return `workflow-trigger:${teamId}:${workflowId}:${triggerId}`;
}

/**
 * Build the message for a workflow trigger cron job
 */
function buildTriggerMessage(teamId: string, workflowId: string) {
  return `openclaw recipes workflows enqueue --team-id ${teamId} --workflow-id ${workflowId} && openclaw recipes workflows runner-tick --team-id ${teamId} --concurrency 4`;
}

// ---------------------------------------------------------------------------
// Single provenance file: <teamDir>/notes/cron-jobs.json
// ---------------------------------------------------------------------------

async function readMapping(mappingPath: string): Promise<MappingStateV1> {
  try {
    const raw = await fs.readFile(mappingPath, "utf8");
    const parsed = JSON.parse(raw) as MappingStateV1;
    if (!parsed || parsed.version !== 1 || !parsed.entries) return { version: 1, entries: {} };
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

async function writeMapping(mappingPath: string, mapping: MappingStateV1): Promise<void> {
  await fs.mkdir(path.dirname(mappingPath), { recursive: true });
  await fs.writeFile(mappingPath, JSON.stringify(mapping, null, 2) + "\n", "utf8");
}

function teamMappingPath(teamDir: string): string {
  return path.join(teamDir, "notes", "cron-jobs.json");
}

async function createTriggerCronJob(
  teamId: string,
  workflowId: string,
  trigger: WorkflowTriggerCronV1
): Promise<string> {
  const name = triggerCronName(teamId, workflowId, trigger.id);
  const message = buildTriggerMessage(teamId, workflowId);
  const description = `Workflow trigger: ${trigger.name || trigger.id}`;

  const args = [
    "cron",
    "add",
    "--agent",
    "main",
    "--session",
    "isolated",
    "--no-deliver",
    "--model",
    "anthropic/claude-sonnet-4-20250514",
    "--name",
    name,
    "--description",
    description,
    "--message",
    message,
    "--cron",
    trigger.expr,
    "--json"
  ];

  if (trigger.tz) {
    args.push("--tz", trigger.tz);
  }

  const result = await runOpenClaw(args);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Failed to create cron job");
  }

  const parsed = JSON.parse(result.stdout) as { id?: string; job?: { id?: string } };
  const cronId = parsed.id || parsed.job?.id;
  if (!cronId) {
    throw new Error("Cron creation succeeded but did not return id");
  }

  return cronId;
}

async function updateTriggerCronJob(
  cronId: string,
  teamId: string,
  workflowId: string,
  trigger: WorkflowTriggerCronV1
): Promise<void> {
  const name = triggerCronName(teamId, workflowId, trigger.id);
  const message = buildTriggerMessage(teamId, workflowId);
  const description = `Workflow trigger: ${trigger.name || trigger.id}`;

  const args = [
    "cron",
    "edit",
    cronId,
    "--name",
    name,
    "--description",
    description,
    "--message",
    message,
    "--cron",
    trigger.expr
  ];

  if (trigger.tz) {
    args.push("--tz", trigger.tz);
  }

  const result = await runOpenClaw(args);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Failed to update cron job");
  }
}

async function enableCronJob(cronId: string): Promise<void> {
  const result = await runOpenClaw(["cron", "enable", cronId]);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Failed to enable cron job");
  }
}

async function disableCronJob(cronId: string): Promise<void> {
  const result = await runOpenClaw(["cron", "disable", cronId]);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Failed to disable cron job");
  }
}

async function removeCronJob(cronId: string): Promise<void> {
  const result = await runOpenClaw(["cron", "remove", cronId]);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Failed to remove cron job");
  }
}

/**
 * Sync workflow triggers with OpenClaw cron jobs
 */
async function syncTriggers(
  teamId: string,
  workflowId: string,
  triggers: WorkflowTriggerCronV1[]
): Promise<{
  created: Array<{ triggerId: string; cronId: string; }>;
  updated: Array<{ triggerId: string; cronId: string; }>;
  enabled: Array<{ triggerId: string; cronId: string; }>;
  disabled: Array<{ triggerId: string; cronId: string; }>;
  removed: Array<{ triggerId: string; cronId: string; }>;
}> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const mappingPath = teamMappingPath(teamDir);
  const mapping = await readMapping(mappingPath);
  const now = Date.now();

  const result = {
    created: [] as Array<{ triggerId: string; cronId: string; }>,
    updated: [] as Array<{ triggerId: string; cronId: string; }>,
    enabled: [] as Array<{ triggerId: string; cronId: string; }>,
    disabled: [] as Array<{ triggerId: string; cronId: string; }>,
    removed: [] as Array<{ triggerId: string; cronId: string; }>,
  };

  // Track which triggers are currently active
  const activeTriggerIds = new Set(triggers.map(t => t.id));

  // Process each trigger
  for (const trigger of triggers) {
    const key = triggerKey(teamId, workflowId, trigger.id);
    const specHash = createSpecHash({
      expr: trigger.expr,
      tz: trigger.tz || "",
      enabled: trigger.enabled ?? true
    });
    
    const existing = mapping.entries[key];

    if (!existing || existing.orphaned) {
      // Create new cron job for enabled triggers
      if (trigger.enabled !== false) {
        const cronId = await createTriggerCronJob(teamId, workflowId, trigger);
        mapping.entries[key] = { installedCronId: cronId, specHash, updatedAtMs: now };
        result.created.push({ triggerId: trigger.id, cronId });
      }
    } else {
      // Update existing cron job
      const cronId = existing.installedCronId;
      const needsUpdate = existing.specHash !== specHash;

      if (needsUpdate) {
        if (trigger.enabled !== false) {
          await updateTriggerCronJob(cronId, teamId, workflowId, trigger);
          await enableCronJob(cronId);
          result.updated.push({ triggerId: trigger.id, cronId });
        } else {
          await disableCronJob(cronId);
          result.disabled.push({ triggerId: trigger.id, cronId });
        }
        mapping.entries[key] = { installedCronId: cronId, specHash, updatedAtMs: now };
      } else {
        // No changes to spec, but check enable/disable state
        if (trigger.enabled !== false) {
          await enableCronJob(cronId);
          result.enabled.push({ triggerId: trigger.id, cronId });
        } else {
          await disableCronJob(cronId);
          result.disabled.push({ triggerId: trigger.id, cronId });
        }
        mapping.entries[key] = { ...existing, updatedAtMs: now };
      }
    }
  }

  // Remove orphaned triggers (those that were removed from workflow)
  const workflowKeyPrefix = `team:${teamId}:workflow:${workflowId}:trigger:`;
  for (const [key, entry] of Object.entries(mapping.entries)) {
    if (!key.startsWith(workflowKeyPrefix)) continue;
    
    const triggerId = key.slice(workflowKeyPrefix.length);
    if (!activeTriggerIds.has(triggerId) && !entry.orphaned) {
      await removeCronJob(entry.installedCronId);
      mapping.entries[key] = { ...entry, orphaned: true, updatedAtMs: now };
      result.removed.push({ triggerId, cronId: entry.installedCronId });
    }
  }

  await writeMapping(mappingPath, mapping);
  return result;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      teamId?: string;
      workflowId?: string;
      triggers?: WorkflowTriggerCronV1[];
    };

    const { action, teamId, workflowId, triggers } = body;

    if (!action || action !== "sync") {
      return NextResponse.json({ ok: false, error: "action must be 'sync'" }, { status: 400 });
    }

    if (!teamId || !workflowId) {
      return NextResponse.json({ ok: false, error: "teamId and workflowId are required" }, { status: 400 });
    }

    if (!Array.isArray(triggers)) {
      return NextResponse.json({ ok: false, error: "triggers must be an array" }, { status: 400 });
    }

    // Filter to only cron triggers
    const cronTriggers = triggers.filter(t => t.kind === "cron") as WorkflowTriggerCronV1[];

    const result = await syncTriggers(teamId, workflowId, cronTriggers);

    return NextResponse.json({
      ok: true,
      action,
      teamId,
      workflowId,
      ...result
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}