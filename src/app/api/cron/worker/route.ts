import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";
import { refreshAllTeamCronCaches } from "@/lib/team-cron-cache";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";

async function cronJobExists(id: string): Promise<boolean> {
  const cronId = String(id ?? "").trim();
  if (!cronId) return false;
  const res = await runOpenClaw(["cron", "list", "--json"]);
  if (!res.ok) return false;
  try {
    const parsed = JSON.parse(String(res.stdout ?? "{}")) as { jobs?: Array<{ id?: unknown }> } | Array<{ id?: unknown }>;
    const jobs = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    return jobs.some((job) => String(job?.id ?? "").trim() === cronId);
  } catch {
    return false;
  }
}

/**
 * Schema version for the cron payload shape Kitchen installs.
 *
 * v1 = agentTurn message only (broad LLM context, all tools allowed).
 *      LLM sometimes hallucinated the CLI path or skipped the exec, leaving
 *      workflow queues to drain unreliably.
 * v2 = agentTurn + --light-context + --tools exec. The LLM now loads a
 *      minimal bootstrap context and can only invoke the exec tool, which
 *      dramatically narrows the failure surface for worker/runner ticks.
 *
 * Bump this when the install shape changes so reconcile can detect stale
 * crons and re-install them.
 */
const PAYLOAD_SCHEMA_VERSION = 2;

/**
 * Extra cron-add flags used for every Kitchen-installed workflow cron.
 *
 * - --light-context: skip heavy bootstrap (agent identity, skills, etc.).
 *   The worker-tick / runner-tick commands do not need that context.
 * - --tools exec: restrict the LLM session to the exec tool only. It cannot
 *   wander into Read/Write/Search and cannot invent alternative workflows.
 */
const WORKFLOW_CRON_NARROW_SCOPE_ARGS: string[] = ["--light-context", "--tools", "exec"];

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
    /**
     * Payload schema version the cron was installed with. Missing or older
     * values mean the cron predates a shape change and should be removed +
     * re-installed on the next reconcile.
     */
    payloadSchemaVersion?: number;
  }>;
};

/**
 * Provenance key — matches the format used by ClawRecipes cron-utils.cronKey()
 * for team-scoped cron jobs. Using the same key format means recipe-installed
 * crons and Kitchen-installed crons share a single namespace and cannot collide.
 */
function workerKey(teamId: string, agentId: string) {
  return `team:${teamId}:recipe:workflow-worker:cron:${agentId}`;
}

function runnerKey(teamId: string) {
  return `team:${teamId}:recipe:workflow-runner:cron:main`;
}

function cronName(teamId: string, agentId: string) {
  return `workflow-worker:${teamId}:${agentId}`;
}

function buildWorkerMessage(teamId: string, agentId: string) {
  return `Workflow worker tick (${agentId}).\n\nRun exactly one shell command using the exec tool.\n\nCommand:\nbash -lc 'openclaw recipes workflows worker-tick --team-id ${teamId} --agent-id ${agentId} --limit 5 --worker-id cron'\n\nRules:\n- Execute with exec and wait for completion.\n- If it succeeds, respond exactly: NO_REPLY\n- If it fails, respond with one short error line.`;
}

/**
 * Optional model override for all workflow crons installed by Kitchen.
 *
 * Defaults to the gateway's configured default model (by omitting the
 * `--model` flag entirely). Set `KITCHEN_WORKFLOW_CRON_MODEL` in the gateway
 * env (e.g. `openai/gpt-5.4`, `anthropic/claude-sonnet-4-5`) to pin a
 * specific model for every workflow-worker and workflow-runner cron Kitchen
 * creates.
 */
function modelFlagArgs(): string[] {
  const override = String(process.env.KITCHEN_WORKFLOW_CRON_MODEL ?? "").trim();
  return override ? ["--model", override] : [];
}

/**
 * Cron schedule used by all Kitchen-installed workflow crons.
 *
 * Defaults to every 5 minutes, matching the runner/worker tick cadence used
 * in production deployments. Override with `KITCHEN_WORKFLOW_CRON_SCHEDULE`
 * if you need a lighter interval such as every 10 or 15 minutes.
 */
function workflowCronSchedule(): string {
  const override = String(process.env.KITCHEN_WORKFLOW_CRON_SCHEDULE ?? "").trim();
  return override || "*/5 * * * *";
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

async function listTeamWorkflowAgentIds(teamId: string): Promise<string[]> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const workflowsDir = path.join(teamDir, "shared-context", "workflows");
  let files: string[] = [];
  try {
    files = (await fs.readdir(workflowsDir)).filter((f) => f.endsWith(".workflow.json"));
  } catch {
    return [];
  }

  const agentIds: string[] = [];
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(workflowsDir, f), "utf8");
      const wf = JSON.parse(raw) as { nodes?: Array<{ type?: unknown; config?: unknown }> };
      const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
      for (const n of nodes) {
        const t = String((n as { type?: unknown }).type ?? "");
        if (t === "start" || t === "end") continue;
        const cfg = (n as { config?: unknown }).config;
        const o = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
        const agentId = String(o.agentId ?? "").trim();
        if (agentId) agentIds.push(agentId);
      }
    } catch {
      // ignore invalid workflow files
    }
  }
  return Array.from(new Set(agentIds));
}

async function installWorkerCron(teamId: string, agentId: string): Promise<{
  alreadyInstalled: boolean;
  installedCronId: string;
  mappingPath: string;
  key: string;
}> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const mp = teamMappingPath(teamDir);
  const key = workerKey(teamId, agentId);
  const now = Date.now();

  const mapping = await readMapping(mp);
  const existing = mapping.entries[key];
  if (existing && existing.installedCronId && !existing.orphaned) {
    const existingId = String(existing.installedCronId);
    const existingSchema = existing.payloadSchemaVersion ?? 1;
    const isStale = existingSchema < PAYLOAD_SCHEMA_VERSION;
    if (await cronJobExists(existingId) && !isStale) {
      await runOpenClaw(["cron", "enable", existingId]);
      return { alreadyInstalled: true, installedCronId: existingId, mappingPath: mp, key };
    }
    if (isStale) await runOpenClaw(["cron", "rm", existingId]);
    delete mapping.entries[key];
    await writeMapping(mp, mapping);
  }

  const name = cronName(teamId, agentId);
  const description = "Workflow worker cron (Kitchen)";
  const message = buildWorkerMessage(teamId, agentId);

  // Worker crons must run as agentId "main" so they have exec tool access
  // to invoke the CLI. The --agent-id flag in the worker-tick command itself
  // determines which agent's queue is drained.
  const add = await runOpenClaw([
    "cron",
    "add",
    "--agent",
    "main",
    "--session",
    "isolated",
    "--cron",
    workflowCronSchedule(),
    "--timeout-seconds",
    "120",
    "--name",
    name,
    "--description",
    description,
    "--message",
    message,
    ...WORKFLOW_CRON_NARROW_SCOPE_ARGS,
    ...modelFlagArgs(),
    "--no-deliver",
    "--json",
  ]);
  if (!add.ok) throw new Error(add.stderr || add.stdout || "Failed to add cron");

  const parsed = JSON.parse(String(add.stdout ?? "{}")) as { id?: unknown; job?: { id?: unknown } };
  const installedCronId = String(parsed?.id ?? parsed?.job?.id ?? "").trim();
  if (!installedCronId) throw new Error("Cron add succeeded but did not return id");

  mapping.entries[key] = {
    installedCronId,
    updatedAtMs: now,
    payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION,
  };
  await writeMapping(mp, mapping);

  return { alreadyInstalled: false, installedCronId, mappingPath: mp, key };
}

async function installRunnerCron(teamId: string): Promise<{
  alreadyInstalled: boolean;
  installedCronId: string;
  mappingPath: string;
  key: string;
}> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const mp = teamMappingPath(teamDir);
  const key = runnerKey(teamId);
  const mapping = await readMapping(mp);

  // Check if already installed
  const existing = mapping.entries[key];
  if (existing && !existing.orphaned) {
    const existingId = String(existing.installedCronId ?? "").trim();
    const existingSchema = existing.payloadSchemaVersion ?? 1;
    const isStale = existingSchema < PAYLOAD_SCHEMA_VERSION;
    if (await cronJobExists(existingId) && !isStale) {
      return { alreadyInstalled: true, installedCronId: existingId, mappingPath: mp, key };
    }
    if (isStale && existingId) await runOpenClaw(["cron", "rm", existingId]);
    delete mapping.entries[key];
    await writeMapping(mp, mapping);
  }

  // Install new runner-tick cron
  const cronName = `workflow-runner-tick:${teamId}`;
  const message = `Runner tick (workflow executor): openclaw recipes workflows runner-tick --team-id ${teamId} --concurrency 4 --lease-seconds 900`;

  const result = await runOpenClaw([
    "cron", "add",
    "--name", cronName,
    "--agent", "main",
    "--session", "isolated",
    "--cron", workflowCronSchedule(),
    "--tz", "America/New_York",
    "--no-deliver",
    "--message", message,
    ...WORKFLOW_CRON_NARROW_SCOPE_ARGS,
    ...modelFlagArgs(),
    "--timeout-seconds", "900",
    "--json"
  ]);

  const cronData = JSON.parse(result.stdout) as { id: string };
  const installedCronId = cronData.id;
  const now = Date.now();

  mapping.entries[key] = {
    installedCronId,
    updatedAtMs: now,
    payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION,
  };
  await writeMapping(mp, mapping);

  return { alreadyInstalled: false, installedCronId, mappingPath: mp, key };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; teamId?: string; agentId?: string };
    const action = String(body.action ?? "").trim();
    const teamId = String(body.teamId ?? "").trim();
    const agentId = String(body.agentId ?? "").trim();

    if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

    if (action === "install") {
      if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
      const res = await installWorkerCron(teamId, agentId);
      // Mutation may have added/replaced/enabled crons — clear list cache.
      invalidateOpenClawCache(["cron", "list"]);
      refreshAllTeamCronCaches().catch(() => {});
      return NextResponse.json({ ok: true, action, teamId, agentId, ...res });
    }

    if (action === "reconcile") {
      const teamDir = await getTeamWorkspaceDir(teamId);
      const mp = teamMappingPath(teamDir);
      const requiredAgentIds = await listTeamWorkflowAgentIds(teamId);

      // Install worker-tick crons for each agent
      const installed: Array<{ agentId: string; installedCronId: string; alreadyInstalled: boolean }> = [];
      for (const a of requiredAgentIds) {
        const res = await installWorkerCron(teamId, a);
        installed.push({ agentId: a, installedCronId: res.installedCronId, alreadyInstalled: res.alreadyInstalled });
      }

      // Install runner-tick cron for the team (only if there are workflows with agents)
      let runnerInstalled = null;
      if (requiredAgentIds.length > 0) {
        const runnerRes = await installRunnerCron(teamId);
        runnerInstalled = {
          agentId: "main",
          installedCronId: runnerRes.installedCronId,
          alreadyInstalled: runnerRes.alreadyInstalled
        };
      }

      // Disable orphaned entries for this team in the single team mapping.
      const disabled: Array<{ agentId: string; installedCronId: string; key: string }> = [];
      const mapping = await readMapping(mp);
      const keyPrefix = `team:${teamId}:recipe:workflow-worker:cron:`;
      let changed = false;
      for (const [k, v] of Object.entries(mapping.entries)) {
        if (!k.startsWith(keyPrefix)) continue;
        const agentInKey = k.slice(keyPrefix.length);
        if (requiredAgentIds.includes(agentInKey)) continue;
        if (v && !v.orphaned) {
          const id = String(v.installedCronId ?? "").trim();
          if (id) await runOpenClaw(["cron", "disable", id]);
          mapping.entries[k] = { ...v, orphaned: true, updatedAtMs: Date.now() };
          disabled.push({ agentId: agentInKey, installedCronId: id, key: k });
          changed = true;
        }
      }
      if (changed) await writeMapping(mp, mapping);

      // Reconcile may have added/disabled multiple crons — clear list cache.
      invalidateOpenClawCache(["cron", "list"]);
      refreshAllTeamCronCaches().catch(() => {});
      return NextResponse.json({
        ok: true,
        action,
        teamId,
        requiredAgentIds,
        installed,
        runnerInstalled,
        disabled,
      });
    }

    return NextResponse.json({ ok: false, error: "action must be install|reconcile" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
