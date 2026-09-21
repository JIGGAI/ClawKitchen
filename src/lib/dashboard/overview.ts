import fs from "node:fs/promises";
import path from "node:path";
import type { AgentQueue, QueueClaim, QueueTask } from "@/lib/dashboard/activity";
import { discoverKitchenPlugins } from "@/lib/kitchen-plugins";
import { readManifest, type KitchenManifest } from "@/lib/manifest";
import { getTeamWorkspaceDir } from "@/lib/paths";
import {
  listInstalledWorkflows,
  listRunGraphs,
  readJsonOrNull,
  resolveTeamIds,
  type InstalledWorkflow,
} from "@/lib/workflows/overview";
import type { RunGraph } from "@/lib/workflows/run-graph";

/** Everything /dashboard reads, straight from files — no CLI calls. */

const QUEUES_DIR = path.join("shared-context", "workflow-queues");
const NEWLINE = 10;

export type DashboardPlugin = { id: string; name: string; tabs: string[]; teamTypes: string[] };

export type DashboardData = {
  now: number;
  manifest: KitchenManifest | null;
  runs: RunGraph[];
  installed: InstalledWorkflow[];
  queues: AgentQueue[];
  plugins: DashboardPlugin[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function toTask(raw: string): QueueTask | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const id = str(o.id);
    return id ? { id, ts: str(o.ts), runId: str(o.runId), nodeId: str(o.nodeId) } : null;
  } catch {
    return null;
  }
}

/** Queue lines with their byte positions: the worker's cursor is a byte offset. */
function parseQueue(buf: Buffer, offsetBytes: number): { all: QueueTask[]; pending: QueueTask[] } {
  const all: QueueTask[] = [];
  const pending: QueueTask[] = [];
  let start = 0;
  while (start < buf.length) {
    const nl = buf.indexOf(NEWLINE, start);
    const end = nl === -1 ? buf.length : nl;
    const task = toTask(buf.subarray(start, end).toString("utf8").trim());
    if (task) {
      all.push(task);
      if (start >= offsetBytes) pending.push(task);
    }
    start = end + 1;
  }
  return { all, pending };
}

async function readClaims(claimsDir: string, files: string[], agentId: string, tasks: Map<string, QueueTask>): Promise<QueueClaim[]> {
  const prefix = `${agentId}.`;
  const claims = await Promise.all(
    files
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map(async (f): Promise<QueueClaim | null> => {
        const raw = await readJsonOrNull(path.join(claimsDir, f));
        const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
        if (!c || (c.agentId !== undefined && c.agentId !== agentId)) return null;
        const taskId = str(c.taskId) ?? f.slice(prefix.length, -".json".length);
        return {
          taskId,
          claimedAt: str(c.claimedAt),
          leaseSeconds: typeof c.leaseSeconds === "number" ? c.leaseSeconds : null,
          task: tasks.get(taskId) ?? null,
        };
      }),
  );
  return claims.filter((c): c is QueueClaim => c !== null);
}

async function readTeamQueues(teamId: string): Promise<AgentQueue[]> {
  const dir = path.join(await getTeamWorkspaceDir(teamId), QUEUES_DIR);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const claimsDir = path.join(dir, "claims");
  const claimFiles = await fs.readdir(claimsDir).catch(() => [] as string[]);

  const agents = files.filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -".jsonl".length));
  return Promise.all(
    agents.map(async (agentId): Promise<AgentQueue> => {
      const [buf, state] = await Promise.all([
        fs.readFile(path.join(dir, `${agentId}.jsonl`)).catch(() => Buffer.alloc(0)),
        readJsonOrNull(path.join(dir, `${agentId}.state.json`)),
      ]);
      const rawOffset = (state as { offsetBytes?: unknown } | null)?.offsetBytes;
      const offset = typeof rawOffset === "number" && rawOffset <= buf.length ? rawOffset : 0;
      const { all, pending } = parseQueue(buf, offset);
      const claims = await readClaims(claimsDir, claimFiles, agentId, new Map(all.map((t) => [t.id, t])));
      return { teamId, agentId, pending, claims };
    }),
  );
}

export async function readAgentQueues(teamIds: string[]): Promise<AgentQueue[]> {
  return (await Promise.all(teamIds.map(readTeamQueues))).flat();
}

function listPlugins(): DashboardPlugin[] {
  try {
    return Array.from(discoverKitchenPlugins().values())
      .map((p) => ({ id: p.id, name: p.name, tabs: p.tabs.map((t) => t.label), teamTypes: p.teamTypes }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const [manifest, teamIds] = await Promise.all([readManifest(), resolveTeamIds("")]);
  const [{ runs }, installed, queues] = await Promise.all([
    listRunGraphs({ teamIds, limit: Number.MAX_SAFE_INTEGER }),
    listInstalledWorkflows(teamIds),
    readAgentQueues(teamIds),
  ]);
  return { now: Date.now(), manifest, runs, installed, queues, plugins: listPlugins() };
}
