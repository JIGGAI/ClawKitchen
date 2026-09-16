import fs from "node:fs/promises";
import path from "node:path";
import { readManifest } from "@/lib/manifest";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { listLocalTeamIds } from "@/lib/teams";
import { buildRunGraph, type RunGraph } from "@/lib/workflows/run-graph";

/** Data for the all-teams /workflows page, read straight from team workspaces. */

const RUNS_DIR = path.join("shared-context", "workflow-runs");
const WORKFLOWS_DIR = path.join("shared-context", "workflows");
const WORKFLOW_SUFFIX = ".workflow.json";
const TEAM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/;

export type InstalledWorkflow = {
  teamId: string;
  id: string;
  name: string | null;
  nodeCount: number;
  cron: string[];
};

type RunEntry = { teamId: string; teamDir: string; name: string; run: Record<string, unknown> };

async function readJsonOrNull(p: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function resolveTeamIds(team: string | null | undefined): Promise<string[]> {
  const requested = String(team ?? "").trim();
  if (requested) {
    if (!TEAM_ID_RE.test(requested)) throw new Error("Invalid team id");
    return [requested];
  }
  const manifest = await readManifest();
  return manifest ? Object.keys(manifest.teams).sort() : listLocalTeamIds();
}

function cronExprs(triggers: unknown): string[] {
  if (!Array.isArray(triggers)) return [];
  const out: string[] = [];
  for (const t of triggers) {
    if (!isObject(t) || t.kind !== "cron" || t.enabled === false) continue;
    const expr = typeof t.expr === "string" ? t.expr : t.cron;
    if (typeof expr === "string" && expr.trim()) out.push(expr);
  }
  return out;
}

async function listTeamWorkflows(teamId: string): Promise<InstalledWorkflow[]> {
  const dir = path.join(await getTeamWorkspaceDir(teamId), WORKFLOWS_DIR);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(WORKFLOW_SUFFIX));
  } catch {
    return [];
  }
  const items = await Promise.all(
    files.map(async (file): Promise<InstalledWorkflow | null> => {
      const wf = await readJsonOrNull(path.join(dir, file));
      if (!isObject(wf)) return null;
      return {
        teamId,
        id: file.slice(0, -WORKFLOW_SUFFIX.length),
        name: typeof wf.name === "string" && wf.name.trim() ? wf.name : null,
        nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
        cron: cronExprs(wf.triggers),
      };
    }),
  );
  return items.filter((x): x is InstalledWorkflow => x !== null);
}

export async function listInstalledWorkflows(teamIds: string[]): Promise<InstalledWorkflow[]> {
  const perTeam = await Promise.all(teamIds.map(listTeamWorkflows));
  return perTeam.flat().sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

async function listTeamRuns(teamId: string): Promise<RunEntry[]> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const runsDir = path.join(teamDir, RUNS_DIR);
  let names: string[];
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    names.map(async (name): Promise<RunEntry | null> => {
      const run = await readJsonOrNull(path.join(runsDir, name, "run.json"));
      return isObject(run) ? { teamId, teamDir, name, run } : null;
    }),
  );
  return entries.filter((e): e is RunEntry => e !== null);
}

// A run waiting on a person is the one this page exists for — however old it is.
function compareRuns(a: RunEntry, b: RunEntry): number {
  const aWaiting = a.run.status === "awaiting_approval";
  const bWaiting = b.run.status === "awaiting_approval";
  if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
  // Runner ids start with an ISO timestamp, so name order is start order.
  if (a.name !== b.name) return a.name < b.name ? 1 : -1;
  return a.teamId.localeCompare(b.teamId);
}

function workflowFileName(run: Record<string, unknown>): string | null {
  const ref = isObject(run.workflow) ? run.workflow : null;
  if (typeof ref?.file !== "string") return null;
  const base = path.basename(ref.file);
  return base.endsWith(WORKFLOW_SUFFIX) ? base : null;
}

export async function listRunGraphs(opts: { teamIds: string[]; limit: number }): Promise<{ runs: RunGraph[]; total: number }> {
  const all = (await Promise.all(opts.teamIds.map(listTeamRuns))).flat().sort(compareRuns);
  const page = all.slice(0, opts.limit);

  const workflows = new Map<string, Promise<unknown>>();
  const loadWorkflow = (entry: RunEntry): Promise<unknown> => {
    const file = workflowFileName(entry.run);
    if (!file) return Promise.resolve(null);
    const p = path.join(entry.teamDir, WORKFLOWS_DIR, file);
    let pending = workflows.get(p);
    if (!pending) {
      pending = readJsonOrNull(p);
      workflows.set(p, pending);
    }
    return pending;
  };

  const runs = await Promise.all(
    page.map(async (entry) => {
      const [workflow, approval] = await Promise.all([
        loadWorkflow(entry),
        readJsonOrNull(path.join(entry.teamDir, RUNS_DIR, entry.name, "approvals", "approval.json")),
      ]);
      return buildRunGraph({ teamId: entry.teamId, runDirName: entry.name, run: entry.run, workflow, approval });
    }),
  );
  return { runs, total: all.length };
}
