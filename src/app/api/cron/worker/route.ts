import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";

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
 * Provenance key — matches the format used by ClawRecipes cron-utils.cronKey()
 * for team-scoped cron jobs. Using the same key format means recipe-installed
 * crons and Kitchen-installed crons share a single namespace and cannot collide.
 */
function workerKey(teamId: string, agentId: string) {
  return `team:${teamId}:recipe:workflow-worker:cron:${agentId}`;
}

function cronName(teamId: string, agentId: string) {
  return `workflow-worker:${teamId}:${agentId}`;
}

function buildWorkerMessage(teamId: string, agentId: string) {
  return `Workflow worker tick: pull + execute pending workflow tasks for this agent.\n\nCommand:\n  openclaw recipes workflows worker-tick --team-id ${teamId} --agent-id ${agentId} --limit 5 --worker-id cron\n`;
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
    await runOpenClaw(["cron", "enable", String(existing.installedCronId)]);
    return { alreadyInstalled: true, installedCronId: String(existing.installedCronId), mappingPath: mp, key };
  }

  const name = cronName(teamId, agentId);
  const description = "Workflow worker cron (Kitchen)";
  const message = buildWorkerMessage(teamId, agentId);

  const add = await runOpenClaw([
    "cron",
    "add",
    "--agent",
    agentId,
    "--cron",
    "*/5 * * * *",
    "--name",
    name,
    "--description",
    description,
    "--message",
    message,
    "--no-deliver",
    "--json",
  ]);
  if (!add.ok) throw new Error(add.stderr || add.stdout || "Failed to add cron");

  const parsed = JSON.parse(String(add.stdout ?? "{}")) as { id?: unknown; job?: { id?: unknown } };
  const installedCronId = String(parsed?.id ?? parsed?.job?.id ?? "").trim();
  if (!installedCronId) throw new Error("Cron add succeeded but did not return id");

  mapping.entries[key] = { installedCronId, updatedAtMs: now };
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
      return NextResponse.json({ ok: true, action, teamId, agentId, ...res });
    }

    if (action === "reconcile") {
      const teamDir = await getTeamWorkspaceDir(teamId);
      const mp = teamMappingPath(teamDir);
      const requiredAgentIds = await listTeamWorkflowAgentIds(teamId);

      const installed: Array<{ agentId: string; installedCronId: string; alreadyInstalled: boolean }> = [];
      for (const a of requiredAgentIds) {
        const res = await installWorkerCron(teamId, a);
        installed.push({ agentId: a, installedCronId: res.installedCronId, alreadyInstalled: res.alreadyInstalled });
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

      return NextResponse.json({ ok: true, action, teamId, requiredAgentIds, installed, disabled });
    }

    return NextResponse.json({ ok: false, error: "action must be install|reconcile" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
